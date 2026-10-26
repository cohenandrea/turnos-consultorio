import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, patients } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { formatPhone } from "@/lib/phone";
import { listAppointments } from "@/lib/services/admin-queries";
import { getActiveCoverages, getSettings } from "@/lib/services/config";
import { formatShort } from "@/lib/time";
import { ApptTable } from "@/components/ApptTable";
import { F, Flash, PageHeader, Section, SubmitButton, Toggle } from "@/components/admin";
import { anonymizePatient, savePatient } from "../../../actions/config";

export default async function Paciente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [p] = await db.select().from(patients).where(eq(patients.id, id));
  if (!p) notFound();
  const [s, covs, rows] = await Promise.all([getSettings(), getActiveCoverages(), listAppointments({ patientId: id, order: "desc", limit: 200 })]);
  const apptIds = rows.map((r) => r.a.id);
  const changes = apptIds.length
    ? await db.select().from(auditLog).where(and(eq(auditLog.entity, "appointment"), inArray(auditLog.entityId, apptIds), inArray(auditLog.action, ["appointment.cancelled", "appointment.rescheduled"]))).orderBy(desc(auditLog.at))
    : [];
  return (
    <>
      <PageHeader title={p.fullName} subtitle={`DNI ${p.dni} · ${formatPhone(p.phone)}`} actions={<Link className="btn-ghost" href="/admin/pacientes">← Pacientes</Link>} />
      <Flash sp={sp} />
      {p.anonymizedAt && <div className="alert-info mb-5">Datos suprimidos el {formatShort(p.anonymizedAt, s.timezone)}.</div>}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <Section title="Datos de contacto">
            <form action={savePatient} className="grid gap-3">
              <input type="hidden" name="id" value={p.id} />
              <F label="Nombre y apellido"><input className="input" name="fullName" defaultValue={p.fullName} required /></F>
              <F label="Celular"><input className="input" name="phone" defaultValue={p.phone} required /></F>
              <F label="Correo"><input className="input" name="email" type="email" defaultValue={p.email ?? ""} /></F>
              <div className="grid grid-cols-2 gap-3">
                <F label="Cobertura">
                  <select className="input" name="coverageId" defaultValue={p.coverageId ?? ""}>
                    <option value="">—</option>
                    {covs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </F>
                <F label="N° de afiliada"><input className="input" name="memberNumber" defaultValue={p.memberNumber ?? ""} /></F>
              </div>
              <Toggle name="consentReminders" defaultChecked={p.consentReminders} label="Autorizó recordatorios" />
              <F label="Nota administrativa"><textarea className="input min-h-16" name="adminNotes" defaultValue={p.adminNotes ?? ""} /></F>
              <SubmitButton>Guardar</SubmitButton>
            </form>
            <p className="mt-3 text-xs text-muted">
              Alta: {formatShort(p.createdAt, s.timezone)}
              {p.privacyAcceptedAt && <> · Aceptó la política de privacidad el {formatShort(p.privacyAcceptedAt, s.timezone)}</>}
            </p>
          </Section>
          {admin.role === "owner" && !p.anonymizedAt && (
            <Section title="Supresión de datos" description="Para pedidos de borrado (art. 16, Ley 25.326). Conserva el historial de turnos sin datos personales.">
              <form action={anonymizePatient}>
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton className="btn-danger" confirm="Se borrarán los datos personales de esta paciente. No se puede deshacer. ¿Continuar?">Suprimir datos personales</SubmitButton>
              </form>
            </Section>
          )}
        </div>
        <div>
          <Section title="Turnos">
            <ApptTable rows={rows} tz={s.timezone} empty="Sin turnos." />
          </Section>
          <Section title="Cancelaciones y reprogramaciones">
            {changes.length === 0 ? <p className="text-muted">Ninguna.</p> : (
              <ul className="space-y-1.5 text-[15px]">
                {changes.map((c) => (
                  <li key={c.id}>
                    {formatShort(c.at, s.timezone)} · {c.action === "appointment.cancelled" ? "Canceló" : "Reprogramó"} ({c.actorType === "patient" ? "paciente" : "consultorio"})
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
