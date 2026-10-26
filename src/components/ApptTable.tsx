import Link from "next/link";
import type { ApptRow } from "@/lib/services/admin-queries";
import { formatShort, formatTime } from "@/lib/time";
import { formatPhone } from "@/lib/phone";
import { Badge, td, th } from "./admin";

export function ApptTable({ rows, tz, timeOnly, empty = "No hay turnos." }: { rows: ApptRow[]; tz: string; timeOnly?: boolean; empty?: string }) {
  if (!rows.length) return <p className="py-4 text-muted">{empty}</p>;
  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className="w-full min-w-[640px]">
        <thead className="border-b border-line">
          <tr>
            <th className={th}>{timeOnly ? "Hora" : "Fecha"}</th>
            <th className={th}>Paciente</th>
            <th className={th}>Cobertura</th>
            <th className={th}>Tipo</th>
            <th className={th}>Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(({ a, coverage, type, location }) => (
            <tr key={a.id} className="hover:bg-soft/60">
              <td className={`${td} font-semibold whitespace-nowrap`}>
                <Link href={`/admin/turnos/${a.id}`} className="hover:underline">
                  {timeOnly ? formatTime(a.startAt, tz) : formatShort(a.startAt, tz)}
                </Link>
              </td>
              <td className={td}>
                <Link href={`/admin/turnos/${a.id}`} className="font-medium hover:underline">
                  {a.contactName}
                </Link>
                <div className="text-xs text-muted">{formatPhone(a.contactPhone)}</div>
              </td>
              <td className={td}>
                {coverage}
                {a.memberNumber && <div className="text-xs text-muted">N° {a.memberNumber}</div>}
              </td>
              <td className={td}>
                {type}
                <div className="text-xs text-muted">{location}</div>
              </td>
              <td className={`${td} space-x-1 space-y-1`}>
                <Badge status={a.status} />
                {a.needsReview && <Badge status="failed" label="Revisar" />}
                {a.attendanceConfirmedAt && a.status === "confirmed" && <Badge status="sent" label="Asistencia OK" />}
                {a.rescheduleCount > 0 && <Badge status="notified" label="Reprogramado" />}
                {a.googleSyncStatus === "error" && <Badge status="error" label="Google" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
