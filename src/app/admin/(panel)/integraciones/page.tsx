import { requireAdmin } from "@/lib/auth";
import { env, isEmailConfigured, isGoogleConfigured, isWhatsAppConfigured } from "@/lib/env";
import { getIntegration, listCalendars, redirectUri } from "@/lib/google/api";
import { getSettings } from "@/lib/services/config";
import { formatShort } from "@/lib/time";
import { Badge, F, Flash, PageHeader, Section, SubmitButton, Toggle } from "@/components/admin";
import { CopyButton } from "@/components/CopyButton";
import { disconnectGoogle, runJobsNow, saveGoogleCalendar, saveGoogleOptions, testEmail, testWhatsApp } from "../../actions/config";

export default async function Integraciones({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin("owner");
  const sp = await searchParams;
  const [s, g] = await Promise.all([getSettings(), getIntegration()]);
  const connected = Boolean(g?.refreshTokenEnc);
  let calendars: Awaited<ReturnType<typeof listCalendars>> = [];
  let calError: string | null = null;
  if (connected) {
    try {
      calendars = await listCalendars();
    } catch (e) {
      calError = (e as Error).message;
    }
  }
  const base = env.appUrl();
  const cronOk = s.lastCronAt && Date.now() - s.lastCronAt.getTime() < 30 * 60_000;
  return (
    <>
      <PageHeader title="Integraciones" subtitle="Google Calendar, WhatsApp, correo electrónico y tareas automáticas." />
      <Flash sp={sp} />

      <Section title="Google Calendar" actions={<Badge status={connected && g?.calendarId ? "synced" : "not_connected"} label={connected ? (g?.calendarId ? "Conectado" : "Falta elegir calendario") : "Sin conectar"} />}>
        {!isGoogleConfigured() ? (
          <div className="alert-info text-sm">
            Para conectar Google Calendar falta cargar <code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code> en las variables de entorno (ver la guía <code>docs/google-calendar.md</code>). URL de redirección autorizada: <code className="break-all">{redirectUri()}</code>
          </div>
        ) : !connected ? (
          <div className="space-y-3">
            <p>Conectá tu cuenta para que cada turno se agende automáticamente y para que tus eventos personales bloqueen horarios.</p>
            <a href="/api/google/connect" className="btn-primary">Conectar con Google</a>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-[15px]">
              Cuenta: <strong>{g?.accountEmail ?? "—"}</strong>
              {g?.lastSyncAt && <> · Última lectura de cambios: {formatShort(g.lastSyncAt, s.timezone)}</>}
            </p>
            {g?.lastError && (
              <p className="alert-error text-sm">
                Último error ({g.lastErrorAt ? formatShort(g.lastErrorAt, s.timezone) : ""}): {g.lastError}
              </p>
            )}
            {calError ? (
              <p className="alert-error text-sm">No se pudieron leer tus calendarios: {calError}. Probá desconectar y volver a conectar.</p>
            ) : (
              <form action={saveGoogleCalendar} className="space-y-3">
                <F label="Calendario donde se guardan los turnos" hint="Recomendado: crear un calendario “Turnos consultorio” aparte del personal.">
                  <select className="input" name="calendarId" defaultValue={g?.calendarId ?? ""} required>
                    <option value="" disabled>Elegí un calendario…</option>
                    {calendars.filter((c) => ["owner", "writer"].includes(c.accessRole)).map((c) => (
                      <option key={c.id} value={c.id}>{c.summary}{c.primary ? " (principal)" : ""}</option>
                    ))}
                  </select>
                </F>
                <fieldset>
                  <legend className="label text-sm">Otros calendarios que también bloquean horarios (opcional)</legend>
                  <div className="flex flex-wrap gap-2">
                    {calendars.map((c) => (
                      <label key={c.id} className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm">
                        <input type="checkbox" name="extraBusy" value={c.id} defaultChecked={g?.extraBusyCalendarIds.includes(c.id)} className="accent-[var(--color-brand)]" /> {c.summary}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <SubmitButton>Guardar calendario</SubmitButton>
              </form>
            )}
            <form action={saveGoogleOptions} className="grid gap-4 rounded-2xl bg-soft p-4 md:grid-cols-2">
              <F label="Cuando una paciente cancela">
                <select className="input" name="googleOnCancel" defaultValue={s.googleOnCancel}>
                  <option value="delete">Eliminar el evento</option>
                  <option value="mark">Dejarlo marcado como “CANCELADO” (libre)</option>
                </select>
              </F>
              <F label="Si muevo o borro un turno en Google Calendar">
                <select className="input" name="googleExternalChange" defaultValue={s.googleExternalChange}>
                  <option value="review">Marcarlo para revisión (recomendado)</option>
                  <option value="cancel">Si lo borro, cancelar el turno y avisar a la paciente</option>
                </select>
              </F>
              <F label="Título de los eventos">
                <select className="input" name="eventTitleFormat" defaultValue={s.eventTitleFormat}>
                  <option value="name">Nombre completo</option>
                  <option value="initials">Solo iniciales (más privado)</option>
                </select>
              </F>
              <div className="flex items-center"><Toggle name="googleAllDayBlocks" defaultChecked={s.googleAllDayBlocks} label="Los eventos de día completo bloquean el día" /></div>
              <div className="md:col-span-2"><SubmitButton className="btn-secondary">Guardar opciones</SubmitButton></div>
            </form>
            <form action={disconnectGoogle}>
              <SubmitButton className="btn-ghost text-danger" confirm="¿Desconectar Google Calendar?">Desconectar</SubmitButton>
            </form>
          </div>
        )}
      </Section>

      <Section title="WhatsApp Business (Meta Cloud API)" actions={<Badge status={isWhatsAppConfigured() ? "synced" : "not_connected"} label={isWhatsAppConfigured() ? "Configurado" : "Sin configurar"} />}>
        {!isWhatsAppConfigured() ? (
          <p className="alert-info text-sm">
            Faltan <code>WHATSAPP_TOKEN</code> y <code>WHATSAPP_PHONE_NUMBER_ID</code>. Mientras tanto, los mensajes se envían por correo electrónico. Guía paso a paso: <code>docs/whatsapp.md</code>.
          </p>
        ) : (
          <form action={testWhatsApp} className="grid gap-3 md:grid-cols-[1fr_1fr_120px_auto] md:items-end">
            <F label="Enviar prueba a"><input className="input" name="to" type="tel" required placeholder="11 2345-6789" /></F>
            <F label="Plantilla"><input className="input font-mono text-sm" name="template" defaultValue="hello_world" /></F>
            <F label="Idioma"><input className="input font-mono text-sm" name="lang" defaultValue="en_US" /></F>
            <SubmitButton className="btn-secondary">Enviar prueba</SubmitButton>
          </form>
        )}
        <div className="mt-4 space-y-1 text-sm">
          <p className="font-semibold">Webhook (estados de entrega)</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-soft px-2 py-1 break-all">{base}/api/webhooks/whatsapp</code>
            <CopyButton text={`${base}/api/webhooks/whatsapp`} />
          </div>
          <p className="text-muted">Token de verificación: el valor de <code>WHATSAPP_VERIFY_TOKEN</code>. Suscribí el campo “messages”.</p>
        </div>
      </Section>

      <Section title="Correo electrónico (SMTP)" actions={<Badge status={isEmailConfigured() ? "synced" : "not_connected"} label={isEmailConfigured() ? "Configurado" : "Sin configurar"} />}>
        {!isEmailConfigured() ? (
          <p className="alert-info text-sm">Faltan <code>SMTP_HOST</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> y <code>EMAIL_FROM</code>. Ver <code>docs/correo.md</code>.</p>
        ) : (
          <form action={testEmail} className="flex flex-wrap items-end gap-3">
            <F label="Enviar prueba a"><input className="input" name="to" type="email" required /></F>
            <SubmitButton className="btn-secondary">Enviar prueba</SubmitButton>
          </form>
        )}
      </Section>

      <Section title="Tarea programada (recordatorios y sincronización)" actions={<Badge status={cronOk ? "synced" : "error"} label={cronOk ? "Funcionando" : "No detectada"} />}>
        <div id="cron" className="space-y-3 text-[15px]">
          <p>
            Última ejecución: <strong>{s.lastCronAt ? formatShort(s.lastCronAt, s.timezone) : "nunca"}</strong>. Debe ejecutarse cada 5 a 10 minutos para enviar recordatorios, reintentar envíos y leer cambios de Google Calendar.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <code className="rounded bg-soft px-2 py-1 break-all">{base}/api/cron</code>
            <CopyButton text={`${base}/api/cron`} />
            <span className="text-muted">con el encabezado <code>Authorization: Bearer CRON_SECRET</code></span>
          </div>
          <form action={runJobsNow}><SubmitButton className="btn-secondary">Ejecutar ahora</SubmitButton></form>
        </div>
      </Section>
    </>
  );
}
