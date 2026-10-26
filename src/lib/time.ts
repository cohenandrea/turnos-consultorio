import { DateTime } from "luxon";

export const DEFAULT_TZ = "America/Argentina/Buenos_Aires";

export function toLocal(ms: number | Date, tz = DEFAULT_TZ) {
  const v = typeof ms === "number" ? ms : ms.getTime();
  return DateTime.fromMillis(v, { zone: tz }).setLocale("es-AR");
}

/** "martes 3 de noviembre" */
export function formatDateLong(ms: number | Date, tz = DEFAULT_TZ) {
  return toLocal(ms, tz).toFormat("cccc d 'de' LLLL");
}

/** "Martes 3 de noviembre" */
export function formatDateLongCap(ms: number | Date, tz = DEFAULT_TZ) {
  const s = formatDateLong(ms, tz);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "10:30" */
export function formatTime(ms: number | Date, tz = DEFAULT_TZ) {
  return toLocal(ms, tz).toFormat("HH:mm");
}

/** "03/11/2026 10:30" */
export function formatShort(ms: number | Date, tz = DEFAULT_TZ) {
  return toLocal(ms, tz).toFormat("dd/LL/yyyy HH:mm");
}

/** "2026-11-03" en la zona horaria del consultorio */
export function localDateKey(ms: number | Date, tz = DEFAULT_TZ) {
  return toLocal(ms, tz).toISODate()!;
}

export function parseHHmm(s: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`Hora inválida: ${s}`);
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 24 || minute > 59) throw new Error(`Hora inválida: ${s}`);
  return { hour, minute };
}

/** Combina una fecha local (yyyy-mm-dd) y hora (HH:mm) en la zona indicada → epoch ms. */
export function localToMs(dateIso: string, hhmm: string, tz = DEFAULT_TZ) {
  const { hour, minute } = parseHHmm(hhmm);
  const d = DateTime.fromISO(dateIso, { zone: tz }).startOf("day");
  if (!d.isValid) throw new Error(`Fecha inválida: ${dateIso}`);
  return d.plus({ hours: hour, minutes: minute }).toMillis();
}

export const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
