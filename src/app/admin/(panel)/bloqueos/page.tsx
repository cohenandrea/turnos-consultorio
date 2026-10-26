import { asc, gte } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import { scheduleExceptions } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getActiveLocations, getSettings } from "@/lib/services/config";
import { formatShort } from "@/lib/time";
import { Badge, F, Flash, PageHeader, Section, SubmitButton, td, th } from "@/components/admin";
import { addException, deleteException, importHolidays } from "../../actions/config";
import { ExceptionForm } from "./ExceptionForm";

const KIND: Record<string, string> = { block: "Bloqueo", holiday: "Feriado", vacation: "Vacaciones", extra: "Horario especial" };

export default async function Bloqueos({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [s, locs, list] = await Promise.all([
    getSettings(),
    getActiveLocations(),
    db.select().from(scheduleExceptions).where(gte(scheduleExceptions.endAt, new Date())).orderBy(asc(scheduleExceptions.startAt)),
  ]);
  const year = DateTime.now().setZone(s.timezone).year;
  return (
    <>
      <PageHeader title="Bloqueos, vacaciones y feriados" subtitle="Los horarios bloqueados dejan de ofrecerse de inmediato. También podés bloquear directamente en Google Calendar." />
      <Flash sp={sp} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <Section title="Agregar">
            <ExceptionForm action={addException} locations={locs.map((l) => ({ id: l.id, name: l.name }))} today={DateTime.now().setZone(s.timezone).toISODate()!} />
          </Section>
          <Section title="Feriados nacionales" description="Importa el calendario oficial desde ArgentinaDatos. Revisá el listado después de importar.">
            <form action={importHolidays} className="flex items-end gap-2">
              <F label="Año"><input className="input w-28" type="number" name="year" defaultValue={year} /></F>
              <SubmitButton className="btn-secondary">Importar feriados</SubmitButton>
            </form>
          </Section>
        </div>
        <Section title="Próximos">
          {list.length === 0 ? (
            <p className="text-muted">No hay bloqueos cargados.</p>
          ) : (
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="w-full min-w-[480px]">
                <thead className="border-b border-line">
                  <tr><th className={th}>Tipo</th><th className={th}>Desde</th><th className={th}>Hasta</th><th className={th}></th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.map((e) => (
                    <tr key={e.id}>
                      <td className={td}>
                        <Badge status={e.kind === "extra" ? "active" : "skipped"} label={KIND[e.kind]} />
                        <div className="mt-1">{e.title}</div>
                        {e.locationId && <div className="text-xs text-muted">{locs.find((l) => l.id === e.locationId)?.name}</div>}
                      </td>
                      <td className={td}>{formatShort(e.startAt, s.timezone)}</td>
                      <td className={td}>{formatShort(e.endAt, s.timezone)}</td>
                      <td className={td}>
                        <form action={deleteException}>
                          <input type="hidden" name="id" value={e.id} />
                          <SubmitButton className="text-sm font-semibold text-danger">Quitar</SubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
