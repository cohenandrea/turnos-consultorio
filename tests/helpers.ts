import postgres from "postgres";
import { DateTime } from "luxon";
import { runMigrations } from "../scripts/migrate";

const TZ = "America/Argentina/Buenos_Aires";

export async function resetDb() {
  const url = process.env.DATABASE_URL!;
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await sql.end();
  await runMigrations(url, { seed: true });
}

/** Fecha local (yyyy-mm-dd) del próximo día hábil (lun–vie) a partir de `minDaysAhead`. */
export function nextWeekday(minDaysAhead = 3, weekday?: number) {
  let d = DateTime.now().setZone(TZ).startOf("day").plus({ days: minDaysAhead });
  while (weekday ? d.weekday !== weekday : d.weekday > 5) d = d.plus({ days: 1 });
  return d.toISODate()!;
}

export function at(dateIso: string, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return DateTime.fromISO(dateIso, { zone: TZ }).set({ hour: h, minute: m }).toMillis();
}

let dniSeq = 30000000;
export function patient(overrides: Partial<{ fullName: string; dni: string; phone: string; email: string | null; memberNumber: string }> = {}) {
  dniSeq++;
  return {
    fullName: "Paciente Prueba",
    dni: String(dniSeq),
    phone: "549110000" + String(dniSeq).slice(-4),
    email: `p${dniSeq}@example.com`,
    memberNumber: "123456",
    ...overrides,
  };
}
