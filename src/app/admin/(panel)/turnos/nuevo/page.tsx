import { requireAdmin } from "@/lib/auth";
import { getActiveCoverages, getActiveLocations, getActiveTypes, getSettings } from "@/lib/services/config";
import { localDateKey } from "@/lib/time";
import { F, Flash, PageHeader, Section, SubmitButton, Toggle } from "@/components/admin";
import { createAppointmentAction } from "../../../actions/appointments";
import { FreeTimes } from "./FreeTimes";

export default async function NuevoTurno({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [s, covs, types, locs] = await Promise.all([getSettings(), getActiveCoverages(), getActiveTypes(), getActiveLocations()]);
  return (
    <>
      <PageHeader title="Nuevo turno" subtitle="Para turnos pedidos por teléfono, WhatsApp o en persona." />
      <Flash sp={sp} />
      <form action={createAppointmentAction} className="grid gap-6 lg:grid-cols-2">
        <Section title="Paciente">
          <div className="grid gap-3">
            <F label="Nombre y apellido"><input className="input" name="fullName" required /></F>
            <div className="grid grid-cols-2 gap-3">
              <F label="DNI" hint="Si ya existe, se actualizan sus datos."><input className="input" name="dni" required inputMode="numeric" /></F>
              <F label="Celular (WhatsApp)"><input className="input" name="phone" required type="tel" /></F>
            </div>
            <F label="Correo electrónico (opcional)"><input className="input" name="email" type="email" /></F>
            <F label="N° de afiliada (si corresponde)"><input className="input" name="memberNumber" /></F>
            <Toggle name="consentReminders" defaultChecked label="La paciente autorizó recibir recordatorios" />
            <F label="Nota interna (opcional)"><textarea className="input min-h-16" name="adminNotes" maxLength={1000} /></F>
          </div>
        </Section>
        <Section title="Turno">
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <F label="Cobertura">
                <select className="input" name="coverageId" required>
                  {covs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </F>
              <F label="Tipo de consulta">
                <select className="input" name="consultationTypeId" required>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.durationMinutes}′)</option>)}
                </select>
              </F>
            </div>
            <F label="Sede">
              <select className="input" name="locationId" required>
                {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </F>
            <FreeTimes defaultDate={localDateKey(Date.now(), s.timezone)} />
            <Toggle name="force" label="Sobreturno: permitir fuera del horario de atención" />
            <p className="text-sm text-muted">Aunque sea sobreturno, el sistema nunca permite superponer dos turnos.</p>
            <SubmitButton className="btn-primary w-full">Crear turno y avisar a la paciente</SubmitButton>
          </div>
        </Section>
      </form>
    </>
  );
}
