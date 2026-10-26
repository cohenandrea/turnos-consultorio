import Link from "next/link";
import { desc, eq, ilike, isNull, or, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { appointments, coverages, patients } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { formatPhone } from "@/lib/phone";
import { getSettings } from "@/lib/services/config";
import { formatShort } from "@/lib/time";
import { F, Flash, PageHeader, Section, td, th } from "@/components/admin";

export default async function Pacientes({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const s = await getSettings();
  const q = sp.q?.trim();
  const rows = await db
    .select({
      p: patients,
      coverage: coverages.name,
      next: sql<Date | null>`(select min(${appointments.startAt}) from ${appointments} where ${appointments.patientId} = ${patients.id} and ${appointments.status} = 'confirmed' and ${appointments.startAt} > now())`,
      total: sql<number>`(select count(*)::int from ${appointments} where ${appointments.patientId} = ${patients.id})`,
    })
    .from(patients)
    .leftJoin(coverages, eq(coverages.id, patients.coverageId))
    .where(and(isNull(patients.anonymizedAt), q ? or(ilike(patients.fullName, `%${q}%`), ilike(patients.dni, `%${q}%`), ilike(patients.phone, `%${q}%`), ilike(patients.email, `%${q}%`)) : undefined))
    .orderBy(desc(patients.updatedAt))
    .limit(200);
  return (
    <>
      <PageHeader
        title="Pacientes"
        subtitle="Datos administrativos de contacto y reservas (sin información clínica)."
        actions={admin.role === "owner" ? <><a className="btn-secondary" href="/api/admin/export?tipo=pacientes">Exportar pacientes</a><a className="btn-secondary" href="/api/admin/export?tipo=turnos">Exportar turnos</a></> : null}
      />
      <Flash sp={sp} />
      <form className="mb-6 flex gap-2" method="get">
        <F label="Buscar" className="flex-1"><input className="input" name="q" defaultValue={q} placeholder="Nombre, DNI, teléfono o correo" /></F>
        <button className="btn-primary self-end">Buscar</button>
      </form>
      <Section title={`${rows.length} pacientes`}>
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-line"><tr><th className={th}>Nombre</th><th className={th}>Contacto</th><th className={th}>Cobertura</th><th className={th}>Próximo turno</th><th className={th}>Turnos</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map(({ p, coverage, next, total }) => (
                <tr key={p.id} className="hover:bg-soft/60">
                  <td className={td}><Link href={`/admin/pacientes/${p.id}`} className="font-semibold hover:underline">{p.fullName}</Link><div className="text-xs text-muted">DNI {p.dni}</div></td>
                  <td className={td}>{formatPhone(p.phone)}<div className="text-xs text-muted">{p.email}</div></td>
                  <td className={td}>{coverage ?? "—"}{p.memberNumber && <div className="text-xs text-muted">N° {p.memberNumber}</div>}</td>
                  <td className={td}>{next ? formatShort(new Date(next), s.timezone) : "—"}</td>
                  <td className={td}>{total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
