import { desc } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/services/config";
import { formatShort } from "@/lib/time";
import { PageHeader, Section, td, th } from "@/components/admin";

export default async function Auditoria() {
  await requireAdmin("owner");
  const s = await getSettings();
  const rows = await db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(300);
  return (
    <>
      <PageHeader title="Registro de cambios" subtitle="Acciones importantes de pacientes, del equipo y del sistema (últimas 300)." />
      <Section title="Actividad">
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-line"><tr><th className={th}>Fecha</th><th className={th}>Quién</th><th className={th}>Acción</th><th className={th}>Sobre</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={`${td} whitespace-nowrap`}>{formatShort(r.at, s.timezone)}</td>
                  <td className={td}>{r.actorType}</td>
                  <td className={`${td} font-mono text-sm`}>{r.action}</td>
                  <td className={td}>
                    {r.entity === "appointment" && r.entityId ? <a className="text-brand underline" href={`/admin/turnos/${r.entityId}`}>turno</a> : r.entity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
