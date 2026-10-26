import Link from "next/link";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { appointments, auditLog, notifications, patients } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { isEmailConfigured, isGoogleConfigured, isWhatsAppConfigured } from "@/lib/env";
import { isGoogleReady } from "@/lib/google/api";
import { countSql, dayRange, listAppointments } from "@/lib/services/admin-queries";
import { findSlots } from "@/lib/services/availability-service";
import { getActiveCoverages, getActiveTypes, getSettings } from "@/lib/services/config";
import { ApptTable } from "@/components/ApptTable";
import { Flash, PageHeader, Section, Stat } from "@/components/admin";

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const s = await getSettings();
  const today = dayRange(s.timezone, 0);
  const tomorrow = dayRange(s.timezone, 1);
  const in7 = dayRange(s.timezone, 7);
  const ago30 = new Date(Date.now() - 30 * 86400_000);

  const [todayRows, tomorrowRows, review, [{ upcoming }], [{ newPatients }], [{ cancelled }], [{ rescheduled }], notifStats, googleReady] = await Promise.all([
    listAppointments({ from: today.from, to: today.to }),
    listAppointments({ from: tomorrow.from, to: tomorrow.to, status: "confirmed" }),
    listAppointments({ needsReview: true, status: "confirmed", from: new Date(Date.now() - 86400_000), limit: 20 }),
    db.select({ upcoming: countSql }).from(appointments).where(and(eq(appointments.status, "confirmed"), gte(appointments.startAt, new Date()), lt(appointments.startAt, in7.to))),
    db.select({ newPatients: countSql }).from(patients).where(gte(patients.createdAt, ago30)),
    db.select({ cancelled: countSql }).from(appointments).where(and(eq(appointments.status, "cancelled"), gte(appointments.cancelledAt, ago30))),
    db.select({ rescheduled: countSql }).from(auditLog).where(and(eq(auditLog.action, "appointment.rescheduled"), gte(auditLog.at, ago30))),
    db
      .select({ status: notifications.status, n: countSql })
      .from(notifications)
      .where(and(inArray(notifications.status, ["pending", "failed"]), gte(notifications.createdAt, ago30)))
      .groupBy(notifications.status),
    isGoogleReady(),
  ]);

  // Horarios libres de la próxima semana (consulta más corta, sin restricciones de cobertura)
  let freeSlots: number | string = "–";
  try {
    const [covs, types] = await Promise.all([getActiveCoverages(), getActiveTypes()]);
    const cov = covs.find((c) => c.kind === "particular") ?? covs[0];
    const type = [...types].sort((a, b) => a.durationMinutes - b.durationMinutes)[0];
    if (cov && type) freeSlots = (await findSlots({ coverageId: cov.id, consultationTypeId: type.id, to: in7.to.getTime() })).slots.length;
  } catch {}

  const pending = notifStats.find((x) => x.status === "pending")?.n ?? 0;
  const failed = notifStats.find((x) => x.status === "failed")?.n ?? 0;
  const cronStale = !s.lastCronAt || Date.now() - s.lastCronAt.getTime() > 30 * 60_000;
  const warnings: React.ReactNode[] = [];
  if (!googleReady) warnings.push(<>Google Calendar no está conectado. <Link className="underline" href="/admin/integraciones">Conectarlo</Link></>);
  if (!isWhatsAppConfigured() && !isEmailConfigured()) warnings.push(<>No hay ningún canal de mensajes configurado: las pacientes no recibirán confirmaciones ni recordatorios. <Link className="underline" href="/admin/integraciones">Ver integraciones</Link></>);
  if (cronStale) warnings.push(<>La tarea programada (recordatorios y sincronización) no se ejecutó en los últimos 30 minutos. <Link className="underline" href="/admin/integraciones#cron">Ver cómo activarla</Link></>);
  if (!isGoogleConfigured() && googleReady === false) {
    /* ya informado arriba */
  }

  return (
    <>
      <PageHeader
        title="Inicio"
        subtitle={today.label.charAt(0).toUpperCase() + today.label.slice(1)}
        actions={
          <>
            <Link href="/admin/turnos/nuevo" className="btn-primary">
              Nuevo turno
            </Link>
            <Link href="/admin/bloqueos" className="btn-secondary">
              Bloquear horario
            </Link>
          </>
        }
      />
      <Flash sp={sp} />
      {warnings.map((w, i) => (
        <div key={i} className="alert-info mb-3 border-[#e9c46a] bg-[#fff8e6]">
          {w}
        </div>
      ))}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Turnos hoy" value={todayRows.filter((r) => r.a.status === "confirmed").length} href="/admin/turnos" />
        <Stat label="Turnos mañana" value={tomorrowRows.length} href="/admin/turnos" />
        <Stat label="Próximos 7 días" value={upcoming} href="/admin/turnos" />
        <Stat label="Horarios libres (7 días)" value={freeSlots} />
        <Stat label="Pacientes nuevas (30 días)" value={newPatients} href="/admin/pacientes" />
        <Stat label="Cancelados (30 días)" value={cancelled} href="/admin/turnos?status=cancelled" />
        <Stat label="Reprogramados (30 días)" value={rescheduled} />
        <Stat label="Mensajes pendientes / fallidos" value={`${pending} / ${failed}`} href="/admin/mensajes" tone={failed ? "warn" : undefined} />
      </div>
      {review.length > 0 && (
        <Section title="Para revisar" description="Turnos con cambios en Google Calendar, datos a verificar o errores de sincronización.">
          <ApptTable rows={review} tz={s.timezone} />
        </Section>
      )}
      <Section title="Turnos de hoy">
        <ApptTable rows={todayRows} tz={s.timezone} timeOnly empty="No hay turnos para hoy." />
      </Section>
      <Section title={`Mañana · ${tomorrow.label}`}>
        <ApptTable rows={tomorrowRows} tz={s.timezone} timeOnly empty="No hay turnos para mañana." />
      </Section>
    </>
  );
}
