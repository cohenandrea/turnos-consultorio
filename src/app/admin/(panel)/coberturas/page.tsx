import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { coverages } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { Badge, Flash, PageHeader, Section, td, th } from "@/components/admin";

const KIND: Record<string, string> = { prepaga: "Prepaga", obra_social: "Obra social", particular: "Particular", otra: "Otra" };

export default async function Coberturas({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin("owner");
  const sp = await searchParams;
  const list = await db.select().from(coverages).orderBy(asc(coverages.sortOrder), asc(coverages.name));
  return (
    <>
      <PageHeader title="Coberturas" subtitle="Prepagas, obras sociales y particular. Las inactivas no se muestran a las pacientes." actions={<Link href="/admin/coberturas/nueva" className="btn-primary">Agregar cobertura</Link>} />
      <Flash sp={sp} />
      <Section title={`${list.length} coberturas`}>
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[560px]">
            <thead className="border-b border-line"><tr><th className={th}>Nombre</th><th className={th}>Tipo</th><th className={th}>Reglas</th><th className={th}>Estado</th></tr></thead>
            <tbody className="divide-y divide-line">
              {list.map((c) => {
                const rules = [
                  c.requiresMemberNumber && "pide N° de afiliada",
                  c.allowedConsultationTypeIds.length && "tipos limitados",
                  c.allowedWeekdays.length && "días limitados",
                  (c.timeFrom || c.timeTo) && `horario ${c.timeFrom ?? ""}–${c.timeTo ?? ""}`,
                  c.allowedLocationIds.length && "sedes limitadas",
                  c.durationOverrideMinutes && `${c.durationOverrideMinutes}′`,
                ].filter(Boolean);
                return (
                  <tr key={c.id} className="hover:bg-soft/60">
                    <td className={td}><Link href={`/admin/coberturas/${c.id}`} className="font-semibold hover:underline">{c.name}</Link><div className="text-xs text-muted">?cobertura={c.slug}</div></td>
                    <td className={td}>{KIND[c.kind] ?? c.kind}</td>
                    <td className={`${td} text-sm text-muted`}>{rules.join(" · ") || "—"}</td>
                    <td className={td}><Badge status={c.active ? "active" : "removed"} label={c.active ? "Activa" : "Inactiva"} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
