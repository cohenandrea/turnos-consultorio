import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, auditLog, consultationTypes, coverages, locations, notifications, patients } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { formatPhone } from "@/lib/phone";
import { formatDateLongCap, formatShort, formatTime, localDateKey } from "@/lib/time";
import { manageLink } from "@/lib/messaging/outbox";
import { getActiveLocations, getSettings } from "@/lib/services/config";
import { Badge, F, Flash, PageHeader, Section, SubmitButton, Toggle, td, th } from "@/components/admin";
import { CopyButton } from "@/components/CopyButton";
import {
  cancelAction,
  notesAction,
  regenerateLinkAction,
  rescheduleAction,
  resendConfirmationAction,
  resyncAction,
  reviewedAction,
  statusAction,
} from "../../../actions/appointments";

const ACTIONS: Record<string, string> = {
  "appointment.created": "Turno creado",
  "appointment.cancelled": "Cancelado",
  "appointment.rescheduled": "Reprogramado",
  "appointment.attendance_confirmed": "La paciente confirmó asistencia",
  "appointment.link_regenerated": "Nuevo enlace de gestión",
  "appointment.flagged": "Marcado para revisión",
  "appointment.reviewed": "Revisado",
  "appointment.completed": "Marcado como atendido",
  "appointment.no_show": "Marcado como ausente",
};

export default async function TurnoDetalle({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [row] = await db
    .select({ a: appointments, p: patients, cov: coverages.name, type: consultationTypes.name, loc: locations })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .innerJoin(coverages, eq(coverages.id, appointments.coverageId))
    .innerJoin(consultationTypes, eq(consultationTypes.id, appointments.consultationTypeId))
    .innerJoin(locations, eq(locations.id, appointments.locationId))
    .where(eq(appointments.id, id));
  if (!row) notFound();
  const { a, p } = row;
  const [s, locs, notifs, history] = await Promise.all([
    getSettings(),
    getActiveLocations(),
    db.select().from(notifications).where(eq(notifications.appointmentId, id)).orderBy(desc(notifications.scheduledFor)),
    db.select().from(auditLog).where(and(eq(auditLog.entity, "appointment"), eq(auditLog.entityId, id))).orderBy(desc(auditLog.at)),
  ]);
  const tz = s.timezone;
  const link = manageLink(a);
  const isPast = a.startAt.getTime() < Date.now();
  const waText = encodeURIComponent(`Hola, ${a.contactName.split(" ")[0]}. Este es el enlace para ver, reprogramar o cancelar tu turno: ${link}`);
  const hidden = <input type="hidden" name="id" value={a.id} />;

  return (
    <>
      <PageHeader
        title={a.contactName}
        subtitle={`${formatDateLongCap(a.startAt, tz)} · ${formatTime(a.startAt, tz)} hs.`}
        actions={
          <Link href="/admin/turnos" className="btn-ghost">
            ← Volver
          </Link>
        }
      />
      <Flash sp={sp} />
      {a.needsReview && (
        <div className="alert-error mb-5 flex flex-wrap items-center justify-between gap-3">
          <span>
            <strong>Para revisar:</strong> {a.reviewReason}
          </span>
          <form action={reviewedAction}>
            {hidden}
            <SubmitButton className="btn-secondary min-h-10 text-sm">Marcar como revisado</SubmitButton>
          </form>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Section title="Datos del turno" actions={<div className="flex gap-1"><Badge status={a.status} />{a.attendanceConfirmedAt && <Badge status="sent" label="Asistencia confirmada" />}</div>}>
            <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-[15px]">
              <dt className="text-muted">Fecha y hora</dt>
              <dd className="font-semibold">{formatShort(a.startAt, tz)} a {formatTime(a.endAt, tz)}</dd>
              <dt className="text-muted">Sede</dt>
              <dd>{row.loc.name} · {row.loc.address}</dd>
              <dt className="text-muted">Cobertura</dt>
              <dd>{row.cov}{a.memberNumber ? ` · N° ${a.memberNumber}` : ""}</dd>
              <dt className="text-muted">Tipo</dt>
              <dd>{row.type}</dd>
              <dt className="text-muted">Celular</dt>
              <dd>
                <a className="text-brand underline" href={`https://wa.me/${a.contactPhone}`} target="_blank" rel="noopener noreferrer">{formatPhone(a.contactPhone)}</a>
              </dd>
              <dt className="text-muted">Correo</dt>
              <dd>{a.contactEmail ?? "–"}</dd>
              <dt className="text-muted">DNI</dt>
              <dd>
                <Link className="text-brand underline" href={`/admin/pacientes/${p.id}`}>{p.dni}</Link>
              </dd>
              <dt className="text-muted">Recordatorios</dt>
              <dd>{a.consentReminders ? "Autorizados" : "No autorizados"}</dd>
              <dt className="text-muted">Origen</dt>
              <dd>{a.source === "web" ? "Reserva online" : "Cargado en el panel"} · {formatShort(a.createdAt, tz)}</dd>
              {a.rescheduleCount > 0 && (<><dt className="text-muted">Reprogramado</dt><dd>{a.rescheduleCount === 1 ? "1 vez" : `${a.rescheduleCount} veces`}</dd></>)}
              {a.cancelledAt && (<><dt className="text-muted">Cancelado</dt><dd>{formatShort(a.cancelledAt, tz)} por {a.cancelledBy === "patient" ? "la paciente" : a.cancelledBy === "google" ? "Google Calendar" : "el consultorio"}</dd></>)}
            </dl>
            <form action={notesAction} className="mt-4 space-y-2">
              {hidden}
              <F label="Nota interna (no la ve la paciente, sin datos clínicos)">
                <textarea name="adminNotes" className="input min-h-20" defaultValue={a.adminNotes ?? ""} maxLength={1000} />
              </F>
              <SubmitButton className="btn-secondary min-h-10 text-sm">Guardar nota</SubmitButton>
            </form>
          </Section>

          <Section title="Mensajes">
            {notifs.length === 0 ? (
              <p className="text-muted">Sin mensajes. Revisá que WhatsApp o el correo estén configurados.</p>
            ) : (
              <div className="-mx-5 overflow-x-auto sm:-mx-6">
                <table className="w-full min-w-[520px]">
                  <thead className="border-b border-line"><tr><th className={th}>Tipo</th><th className={th}>Canal</th><th className={th}>Programado</th><th className={th}>Estado</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {notifs.map((n) => (
                      <tr key={n.id}>
                        <td className={td}>{n.kind.replace("_", " ")}</td>
                        <td className={td}>{n.channel === "whatsapp" ? "WhatsApp" : "Correo"}</td>
                        <td className={td}>{formatShort(n.scheduledFor, tz)}</td>
                        <td className={td}>
                          <Badge status={n.status} />
                          {n.lastError && <div className="mt-1 text-xs text-danger">{n.lastError}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Historial">
            <ul className="space-y-2 text-[15px]">
              {history.map((h) => (
                <li key={h.id} className="flex gap-3">
                  <span className="w-32 shrink-0 text-muted">{formatShort(h.at, tz)}</span>
                  <span>
                    {ACTIONS[h.action] ?? h.action}
                    <span className="text-muted"> · {h.actorType === "patient" ? "paciente" : h.actorType === "admin" ? "consultorio" : h.actorType}</span>
                    {h.action === "appointment.rescheduled" && h.details ? (
                      <span className="block text-sm text-muted">
                        {formatShort(new Date(String(h.details.from)), tz)} → {formatShort(new Date(String(h.details.to)), tz)}
                      </span>
                    ) : null}
                    {h.action === "appointment.flagged" && h.details ? <span className="block text-sm text-muted">{String(h.details.reason)}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <div>
          {a.status === "confirmed" && (
            <>
              <Section title="Reprogramar">
                <form action={rescheduleAction} className="grid grid-cols-2 gap-3">
                  {hidden}
                  <F label="Fecha"><input className="input" type="date" name="date" required defaultValue={localDateKey(a.startAt, tz)} /></F>
                  <F label="Hora"><input className="input" type="time" name="time" required step={300} defaultValue={formatTime(a.startAt, tz)} /></F>
                  <F label="Sede" className="col-span-2">
                    <select className="input" name="locationId" defaultValue={a.locationId}>
                      {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </F>
                  <div className="col-span-2"><Toggle name="force" label="Permitir fuera del horario de atención (sobreturno)" /></div>
                  <div className="col-span-2"><SubmitButton className="btn-primary w-full">Reprogramar y avisar</SubmitButton></div>
                </form>
              </Section>
              <Section title="Cancelar turno">
                <form action={cancelAction} className="space-y-3">
                  {hidden}
                  <Toggle name="notify" defaultChecked label="Avisar a la paciente" />
                  <SubmitButton className="btn-danger w-full" confirm="¿Cancelar este turno? El horario quedará libre.">Cancelar turno</SubmitButton>
                </form>
              </Section>
            </>
          )}
          {a.status === "confirmed" && isPast && (
            <Section title="Asistencia">
              <div className="grid grid-cols-2 gap-2">
                <form action={statusAction}>{hidden}<input type="hidden" name="status" value="completed" /><SubmitButton className="btn-secondary w-full">Atendida</SubmitButton></form>
                <form action={statusAction}>{hidden}<input type="hidden" name="status" value="no_show" /><SubmitButton className="btn-secondary w-full">Ausente</SubmitButton></form>
              </div>
            </Section>
          )}
          <Section title="Enlace de la paciente" description="Para consultar, reprogramar o cancelar. No lo publiques.">
            <p className="mb-3 rounded-xl bg-soft p-3 font-mono text-xs break-all">{link}</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={link} />
              <a className="btn-secondary min-h-10 px-3 text-sm" href={`https://wa.me/${a.contactPhone}?text=${waText}`} target="_blank" rel="noopener noreferrer">Enviar por WhatsApp</a>
              {a.status === "confirmed" && (
                <form action={resendConfirmationAction}>{hidden}<SubmitButton className="btn-secondary min-h-10 px-3 text-sm">Reenviar confirmación</SubmitButton></form>
              )}
              <form action={regenerateLinkAction}>{hidden}<SubmitButton className="btn-ghost min-h-10 px-3 text-sm" confirm="El enlace actual dejará de funcionar. ¿Continuar?">Generar enlace nuevo</SubmitButton></form>
            </div>
          </Section>
          <Section title="Google Calendar" actions={<Badge status={a.googleSyncStatus} />}>
            {a.googleEventId && <p className="text-sm text-muted">Evento: <span className="font-mono">{a.googleEventId}</span></p>}
            {a.googleSyncError && <p className="mt-1 text-sm text-danger">{a.googleSyncError}</p>}
            <form action={resyncAction} className="mt-3">{hidden}<SubmitButton className="btn-secondary min-h-10 text-sm">Sincronizar ahora</SubmitButton></form>
          </Section>
        </div>
      </div>
    </>
  );
}
