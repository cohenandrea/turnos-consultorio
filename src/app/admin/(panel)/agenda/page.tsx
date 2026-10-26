import { asc } from "drizzle-orm";
import { db } from "@/db";
import { consultationTypes, locations, scheduleRules } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/services/config";
import { WEEKDAYS } from "@/lib/time";
import { F, Flash, PageHeader, Section, SubmitButton, Toggle } from "@/components/admin";
import { addRule, deleteRule, saveBookingRules, saveLocation, saveType } from "../../actions/config";

export default async function Agenda({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin("owner");
  const sp = await searchParams;
  const [s, rules, locs, types] = await Promise.all([
    getSettings(),
    db.select().from(scheduleRules).orderBy(asc(scheduleRules.weekday), asc(scheduleRules.startTime)),
    db.select().from(locations).orderBy(asc(locations.sortOrder), asc(locations.id)),
    db.select().from(consultationTypes).orderBy(asc(consultationTypes.sortOrder), asc(consultationTypes.id)),
  ]);
  const num = (name: string, label: string, value: number, hint?: string) => (
    <F label={label} hint={hint}>
      <input className="input" type="number" name={name} defaultValue={value} min={0} required />
    </F>
  );
  return (
    <>
      <PageHeader title="Horarios y agenda" subtitle="Días de atención, duración de consultas, sedes y reglas de reserva." />
      <Flash sp={sp} />

      <Section title="Horario semanal de atención" description="Cargá una o más franjas por día. El tiempo entre franjas funciona como descanso (por ejemplo, 9 a 13 y 15 a 19).">
        {locs.map((loc) => (
          <div key={loc.id} className="mb-5">
            {locs.length > 1 && <p className="mb-2 font-semibold">{loc.name}</p>}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {WEEKDAYS.map((day, i) => {
                const dayRules = rules.filter((r) => r.locationId === loc.id && r.weekday === i + 1);
                return (
                  <div key={day} className="rounded-2xl border border-line p-3">
                    <p className="mb-1.5 font-semibold">{day}</p>
                    {dayRules.length === 0 ? (
                      <p className="text-sm text-muted">No atiende</p>
                    ) : (
                      <ul className="space-y-1">
                        {dayRules.map((r) => (
                          <li key={r.id} className="flex items-center justify-between rounded-lg bg-soft px-2.5 py-1.5 text-[15px]">
                            {r.startTime} a {r.endTime}
                            <form action={deleteRule}>
                              <input type="hidden" name="id" value={r.id} />
                              <button className="text-sm font-semibold text-danger" aria-label={`Eliminar franja ${r.startTime} a ${r.endTime}`}>
                                Quitar
                              </button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <form action={addRule} className="mt-4 grid gap-3 rounded-2xl bg-soft p-4 md:grid-cols-[1fr_auto_auto_auto_auto] md:items-end">
          <fieldset>
            <legend className="label text-sm">Días</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d, i) => (
                <label key={d} className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm">
                  <input type="checkbox" name="weekday" value={i + 1} className="accent-[var(--color-brand)]" /> {d.slice(0, 3)}
                </label>
              ))}
            </div>
          </fieldset>
          <F label="Desde"><input className="input" type="time" name="startTime" defaultValue="09:00" required /></F>
          <F label="Hasta"><input className="input" type="time" name="endTime" defaultValue="13:00" required /></F>
          <F label="Sede">
            <select className="input" name="locationId">{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </F>
          <SubmitButton className="btn-primary">Agregar franja</SubmitButton>
        </form>
      </Section>

      <Section title="Reglas de reserva">
        <form action={saveBookingRules} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {num("slotIntervalMinutes", "Intervalo entre inicios de turno (min)", s.slotIntervalMinutes, "Ej.: 30 → 9:00, 9:30, 10:00…")}
          {num("bufferMinutes", "Tiempo libre entre pacientes (min)", s.bufferMinutes)}
          {num("minNoticeHours", "Anticipación mínima (horas)", s.minNoticeHours, "No se ofrecen turnos antes de este plazo")}
          {num("maxAdvanceDays", "Reservas hasta (días a futuro)", s.maxAdvanceDays, "60 ≈ 2 meses")}
          {num("cancelLimitHours", "Cancelar online hasta (horas antes)", s.cancelLimitHours)}
          {num("rescheduleLimitHours", "Reprogramar online hasta (horas antes)", s.rescheduleLimitHours)}
          {num("maxActivePerPatient", "Turnos futuros por paciente", s.maxActivePerPatient, "0 = sin límite")}
          <div className="flex items-end"><SubmitButton className="btn-primary w-full">Guardar reglas</SubmitButton></div>
        </form>
      </Section>

      <Section title="Tipos de consulta" description="La duración define cuánto ocupa cada turno en la agenda.">
        <div className="space-y-3">
          {[...types, null].map((t) => (
            <form key={t?.id ?? "new"} action={saveType} className="grid gap-3 rounded-2xl border border-line p-3 md:grid-cols-[1.2fr_2fr_0.6fr_0.5fr_auto_auto] md:items-end">
              <input type="hidden" name="id" value={t?.id ?? ""} />
              <F label="Nombre"><input className="input" name="name" defaultValue={t?.name} required placeholder={t ? "" : "Nuevo tipo…"} /></F>
              <F label="Descripción para la paciente"><input className="input" name="description" defaultValue={t?.description ?? ""} /></F>
              <F label="Duración (min)"><input className="input" type="number" name="durationMinutes" min={5} defaultValue={t?.durationMinutes ?? 30} /></F>
              <F label="Orden"><input className="input" type="number" name="sortOrder" defaultValue={t?.sortOrder ?? types.length} /></F>
              <div className="pb-3"><Toggle name="active" defaultChecked={t?.active ?? true} label="Activo" /></div>
              <SubmitButton className={t ? "btn-secondary" : "btn-primary"}>{t ? "Guardar" : "Agregar"}</SubmitButton>
            </form>
          ))}
        </div>
      </Section>

      <Section title="Sedes / consultorios">
        <div className="space-y-3">
          {[...locs, null].map((l) => (
            <form key={l?.id ?? "new"} action={saveLocation} className="grid gap-3 rounded-2xl border border-line p-3 md:grid-cols-2 lg:grid-cols-[1fr_1.5fr_1.2fr_1fr_auto_auto] lg:items-end">
              <input type="hidden" name="id" value={l?.id ?? ""} />
              <F label="Nombre"><input className="input" name="name" defaultValue={l?.name} required placeholder={l ? "" : "Nueva sede…"} /></F>
              <F label="Dirección"><input className="input" name="address" defaultValue={l?.address} required /></F>
              <F label="Enlace a Google Maps"><input className="input" name="mapsUrl" defaultValue={l?.mapsUrl ?? ""} placeholder="https://maps.app.goo.gl/…" /></F>
              <F label="Indicaciones"><input className="input" name="notes" defaultValue={l?.notes ?? ""} placeholder="Piso, timbre…" /></F>
              <div className="pb-3"><Toggle name="active" defaultChecked={l?.active ?? true} label="Activa" /></div>
              <SubmitButton className={l ? "btn-secondary" : "btn-primary"}>{l ? "Guardar" : "Agregar"}</SubmitButton>
            </form>
          ))}
        </div>
      </Section>
    </>
  );
}
