import Link from "next/link";
import { DateTime } from "luxon";

type A = { id: string; start: string; end: string; name: string; coverage: string; status: string; review: boolean };
type B = { start: string; end: string; title: string };

const START_H = 7;
const END_H = 21;
const PX_PER_MIN = 1.1;

export function WeekCalendar({ tz, weekStart, appointments, blocks }: { tz: string; weekStart: string; appointments: A[]; blocks: B[] }) {
  const days = Array.from({ length: 7 }, (_, i) => DateTime.fromISO(weekStart, { zone: tz }).plus({ days: i }).setLocale("es-AR"));
  const height = (END_H - START_H) * 60 * PX_PER_MIN;
  const top = (iso: string, day: DateTime) => {
    const t = DateTime.fromISO(iso, { zone: tz });
    const mins = t < day ? 0 : t.diff(day.set({ hour: START_H }), "minutes").minutes;
    return Math.max(0, Math.min(height, mins * PX_PER_MIN));
  };
  const today = DateTime.now().setZone(tz).toISODate();
  return (
    <div className="card overflow-x-auto p-3 sm:p-4">
      <div className="grid min-w-[860px] grid-cols-[48px_repeat(7,1fr)]">
        <div />
        {days.map((d) => (
          <div key={d.toISODate()} className={`pb-2 text-center text-sm font-semibold capitalize ${d.toISODate() === today ? "text-brand" : ""}`}>
            {d.toFormat("ccc d")}
          </div>
        ))}
        <div className="relative" style={{ height }}>
          {Array.from({ length: END_H - START_H }, (_, i) => (
            <div key={i} className="absolute right-1 -translate-y-2 text-xs text-muted" style={{ top: i * 60 * PX_PER_MIN }}>
              {String(START_H + i).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {days.map((d) => {
          const dayStart = d.startOf("day");
          const dayEnd = dayStart.plus({ days: 1 });
          const inDay = (s: string, e: string) => DateTime.fromISO(s) < dayEnd && DateTime.fromISO(e) > dayStart;
          return (
            <div key={d.toISODate()} className="relative border-l border-line" style={{ height }}>
              {Array.from({ length: END_H - START_H }, (_, i) => (
                <div key={i} className="absolute inset-x-0 border-t border-line/60" style={{ top: i * 60 * PX_PER_MIN }} />
              ))}
              {blocks
                .filter((b) => inDay(b.start, b.end))
                .map((b, i) => {
                  const t = top(b.start, dayStart);
                  const bottom = DateTime.fromISO(b.end) > dayEnd ? height : top(b.end, dayStart);
                  return (
                    <div
                      key={i}
                      className="absolute inset-x-0.5 overflow-hidden rounded-md bg-[repeating-linear-gradient(45deg,#ece7e0,#ece7e0_6px,#f5f2ee_6px,#f5f2ee_12px)] p-1 text-[11px] text-muted"
                      style={{ top: t, height: Math.max(16, bottom - t) }}
                    >
                      {b.title}
                    </div>
                  );
                })}
              {appointments
                .filter((a) => inDay(a.start, a.end))
                .map((a) => {
                  const t = top(a.start, dayStart);
                  const h = Math.max(22, top(a.end, dayStart) - t);
                  return (
                    <Link
                      key={a.id}
                      href={`/admin/turnos/${a.id}`}
                      className={`absolute inset-x-0.5 overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-[12px] leading-tight shadow-sm ${
                        a.review ? "border-danger bg-[#fbeceb]" : a.status === "confirmed" ? "border-brand bg-brand/10" : "border-line bg-soft"
                      }`}
                      style={{ top: t, height: h }}
                    >
                      <span className="font-semibold">{DateTime.fromISO(a.start, { zone: tz }).toFormat("HH:mm")}</span> {a.name}
                      <span className="block text-muted">{a.coverage}</span>
                    </Link>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
