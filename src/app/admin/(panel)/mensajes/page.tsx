import { desc, gte } from "drizzle-orm";
import { db } from "@/db";
import { messageTemplates, notifications } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { isEmailConfigured, isWhatsAppConfigured } from "@/lib/env";
import { PLACEHOLDERS, toMetaTemplate } from "@/lib/messaging/templates";
import { getSettings } from "@/lib/services/config";
import { formatShort } from "@/lib/time";
import { Badge, F, Flash, PageHeader, Section, SubmitButton, Toggle, td, th } from "@/components/admin";
import { CopyButton } from "@/components/CopyButton";
import { retryFailed, saveReminderSettings, saveTemplate } from "../../actions/config";

const ORDER = ["confirmation", "reminder_48", "reminder_24", "reschedule", "cancellation", "waitlist_offer", "otp"];

export default async function Mensajes({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin("owner");
  const sp = await searchParams;
  const [s, templates, log] = await Promise.all([
    getSettings(),
    db.select().from(messageTemplates),
    db.select().from(notifications).where(gte(notifications.createdAt, new Date(Date.now() - 14 * 86400_000))).orderBy(desc(notifications.scheduledFor)).limit(100),
  ]);
  templates.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  return (
    <>
      <PageHeader title="Mensajes y recordatorios" subtitle={`WhatsApp: ${isWhatsAppConfigured() ? "configurado" : "sin configurar"} · Correo: ${isEmailConfigured() ? "configurado" : "sin configurar"}`} />
      <Flash sp={sp} />
      <Section title="Recordatorios automáticos">
        <form action={saveReminderSettings} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <Toggle name="reminder48Enabled" defaultChecked={s.reminder48Enabled} label="48 horas antes" />
          <Toggle name="reminder24Enabled" defaultChecked={s.reminder24Enabled} label="24 horas antes" />
          <F label="Enviar desde las"><input className="input" type="time" name="reminderWindowStart" defaultValue={s.reminderWindowStart} /></F>
          <F label="Hasta las"><input className="input" type="time" name="reminderWindowEnd" defaultValue={s.reminderWindowEnd} /></F>
          <SubmitButton>Guardar</SubmitButton>
        </form>
        <p className="mt-3 text-sm text-muted">Los recordatorios solo se envían a pacientes que los autorizaron. Si un turno se cancela o reprograma, los pendientes se cancelan o se reprograman solos.</p>
      </Section>

      <Section title="Textos de los mensajes" description={`Variables disponibles: ${PLACEHOLDERS.map((p) => `{${p}}`).join(" ")}`}>
        <div className="alert-info mb-5 text-sm">
          <strong>Importante sobre WhatsApp:</strong> Meta exige que los mensajes automáticos usen plantillas aprobadas. El texto de abajo se usa tal cual para el correo; para WhatsApp, copiá el “texto para Meta” y crealo como plantilla con el mismo nombre. Si cambiás el texto o el orden de las variables, tenés que volver a aprobar la plantilla en Meta.
        </div>
        <div className="space-y-5">
          {templates.map((t) => (
            <form key={t.key} action={saveTemplate} className="rounded-2xl border border-line p-4">
              <input type="hidden" name="key" value={t.key} />
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{t.label}</p>
                <Toggle name="enabled" defaultChecked={t.enabled} label="Activo" />
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <F label="Texto">
                  <textarea className="input min-h-36" name="body" defaultValue={t.body} />
                </F>
                <div className="space-y-3">
                  <F label="Asunto del correo"><input className="input" name="emailSubject" defaultValue={t.emailSubject} /></F>
                  <div className="grid grid-cols-[1fr_110px] gap-2">
                    <F label="Nombre de la plantilla en Meta"><input className="input font-mono text-sm" name="whatsappTemplateName" defaultValue={t.whatsappTemplateName ?? ""} /></F>
                    <F label="Idioma"><input className="input font-mono text-sm" name="whatsappLanguage" defaultValue={t.whatsappLanguage} /></F>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-semibold">Texto para Meta</span>
                      <CopyButton text={toMetaTemplate(t.body)} />
                    </div>
                    <pre className="rounded-xl bg-soft p-3 text-xs whitespace-pre-wrap">{toMetaTemplate(t.body)}</pre>
                    {t.key === "otp" && <p className="mt-1 text-xs text-muted">Creala como plantilla de categoría “Autenticación” con botón “Copiar código”.</p>}
                  </div>
                </div>
              </div>
              <SubmitButton className="btn-secondary mt-3">Guardar</SubmitButton>
            </form>
          ))}
        </div>
      </Section>

      <Section
        title="Últimos envíos (14 días)"
        actions={
          <form action={retryFailed}>
            <SubmitButton className="btn-secondary min-h-10 text-sm">Reintentar fallidos</SubmitButton>
          </form>
        }
      >
        {log.length === 0 ? (
          <p className="text-muted">Todavía no hay mensajes.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-line"><tr><th className={th}>Programado</th><th className={th}>Tipo</th><th className={th}>Canal</th><th className={th}>Estado</th><th className={th}>Intentos</th></tr></thead>
              <tbody className="divide-y divide-line">
                {log.map((n) => (
                  <tr key={n.id}>
                    <td className={td}>{n.appointmentId ? <a className="hover:underline" href={`/admin/turnos/${n.appointmentId}`}>{formatShort(n.scheduledFor, s.timezone)}</a> : formatShort(n.scheduledFor, s.timezone)}</td>
                    <td className={td}>{templates.find((t) => t.key === n.kind)?.label ?? n.kind}</td>
                    <td className={td}>{n.channel === "whatsapp" ? "WhatsApp" : "Correo"}</td>
                    <td className={td}><Badge status={n.status} />{n.lastError && <div className="mt-1 max-w-xs text-xs text-danger">{n.lastError}</div>}</td>
                    <td className={td}>{n.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
