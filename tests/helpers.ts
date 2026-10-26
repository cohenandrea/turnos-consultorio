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
  // Agenda fija para las pruebas (independiente de los datos reales del consultorio):
  // sede 1, lunes a viernes 9–13 y 15–19, turnos cada 30', primera consulta 40' y control 30'.
  const fx = postgres(url, { max: 1, onnotice: () => {} });
  await fx.unsafe(`
    DELETE FROM schedule_rules;
    INSERT INTO schedule_rules (location_id, weekday, start_time, end_time)
      SELECT 1, d, t.s, t.e FROM generate_series(1, 5) d, (VALUES ('09:00', '13:00'), ('15:00', '19:00')) AS t(s, e);
    DELETE FROM consultation_types;
    INSERT INTO consultation_types (id, slug, name, duration_minutes, sort_order) VALUES
      (1, 'primera-vez', 'Primera consulta', 40, 0), (2, 'control', 'Control', 30, 1);
    SELECT setval(pg_get_serial_sequence('consultation_types', 'id'), 2);
    UPDATE settings SET slot_interval_minutes = 30;`);
  await fx.end();
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
