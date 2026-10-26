import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { consultationTypes, coverages, waitlist } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { formatPhone } from "@/lib/phone";
import { getSettings } from "@/lib/services/config";
import { formatShort } from "@/lib/time";
import { Badge, Flash, PageHeader, Section, SubmitButton, td, th } from "@/components/admin";
import { removeWaitlist } from "../../actions/config";

const PREF: Record<string, string> = { any: "Cualquier horario", morning: "Mañana", afternoon: "Tarde" };

export default async function ListaEspera({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const s = await getSettings();
  const rows = await db
    .select({ w: waitlist, coverage: coverages.name, type: consultationTypes.name })
    .from(waitlist)
    .innerJoin(coverages, eq(coverages.id, waitlist.coverageId))
    .innerJoin(consultationTypes, eq(consultationTypes.id, waitlist.consultationTypeId))
    .where(inArray(waitlist.status, ["active", "notified"]))
    .orderBy(desc(waitlist.createdAt));
  return (
    <>
      <PageHeader title="Lista de espera" subtitle="Cuando se libera un turno, el sistema avisa automáticamente a las primeras pacientes compatibles. El turno es de quien lo confirma primero." />
      <Flash sp={sp} />
      <Section title={`${rows.length} en espera`}>
        {rows.length === 0 ? <p className="text-muted">Nadie en lista de espera.</p> : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-line"><tr><th className={th}>Paciente</th><th className={th}>Busca</th><th className={th}>Preferencia</th><th className={th}>Estado</th><th className={th}></th></tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map(({ w, coverage, type }) => (
                  <tr key={w.id}>
                    <td className={td}><span className="font-semibold">{w.fullName}</span><div className="text-xs text-muted">{formatPhone(w.phone)} · desde {formatShort(w.createdAt, s.timezone)}</div></td>
                    <td className={td}>{coverage}<div className="text-xs text-muted">{type}</div></td>
                    <td className={td}>{PREF[w.timePreference]}{w.wantsBefore && <div className="text-xs text-muted">antes del {formatShort(w.wantsBefore, s.timezone).slice(0, 10)}</div>}</td>
                    <td className={td}><Badge status={w.status} />{w.notifyCount > 0 && <div className="text-xs text-muted">{w.notifyCount} aviso(s)</div>}</td>
                    <td className={td}><form action={removeWaitlist}><input type="hidden" name="id" value={w.id} /><SubmitButton className="text-sm font-semibold text-danger">Quitar</SubmitButton></form></td>
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
