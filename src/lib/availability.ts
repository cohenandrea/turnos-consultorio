/**
 * Motor de disponibilidad: funciones puras (sin base de datos ni red) para poder
 * probarlas exhaustivamente. Todos los instantes son epoch en milisegundos.
 */
import { DateTime } from "luxon";
import { parseHHmm } from "./time";

export type Interval = { start: number; end: number };
export type Slot = { start: number; end: number; locationId: number };

export type RuleInput = { locationId: number; weekday: number; startTime: string; endTime: string; active?: boolean };
export type ExceptionInput = { kind: string; startAt: number; endAt: number; locationId: number | null };
export type CoverageConstraint = {
  allowedWeekdays: number[];
  allowedLocationIds: number[];
  timeFrom: string | null;
  timeTo: string | null;
};

export type EngineInput = {
  now: number;
  tz: string;
  from: number;
  to: number;
  rules: RuleInput[];
  exceptions: ExceptionInput[];
  busy: Interval[];
  durationMinutes: number;
  bufferMinutes: number;
  slotIntervalMinutes: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  /** Fecha desde la que se empiezan a dar turnos (epoch ms); el horizonte se cuenta desde ahí. */
  opensAt?: number | null;
  locationIds: number[];
  coverage?: CoverageConstraint | null;
};

const MIN = 60_000;
export const BLOCKING_KINDS = new Set(["block", "holiday", "vacation"]);

export function overlaps(a: Interval, b: Interval) {
  return a.start < b.end && b.start < a.end;
}

/** Une intervalos superpuestos o contiguos. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** Resta `cut` de cada intervalo de `base`. */
export function subtractIntervals(base: Interval[], cut: Interval[]): Interval[] {
  let result = mergeIntervals(base);
  for (const c of mergeIntervals(cut)) {
    const next: Interval[] = [];
    for (const b of result) {
      if (!overlaps(b, c)) {
        next.push(b);
        continue;
      }
      if (c.start > b.start) next.push({ start: b.start, end: c.start });
      if (c.end < b.end) next.push({ start: c.end, end: b.end });
    }
    result = next;
  }
  return result;
}

export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const x of a) for (const y of b) {
    const start = Math.max(x.start, y.start);
    const end = Math.min(x.end, y.end);
    if (end > start) out.push({ start, end });
  }
  return mergeIntervals(out);
}

/** Límite más lejano permitido para reservar (fin del día "hoy + maxAdvanceDays"). */
export function bookingHorizon(now: number, tz: string, maxAdvanceDays: number) {
  return DateTime.fromMillis(now, { zone: tz }).startOf("day").plus({ days: maxAdvanceDays + 1 }).toMillis();
}

export function earliestBookable(now: number, minNoticeHours: number) {
  return now + minNoticeHours * 60 * MIN;
}

function dayWindow(day: DateTime, startTime: string, endTime: string): Interval {
  const s = parseHHmm(startTime);
  const e = parseHHmm(endTime);
  return {
    start: day.plus({ hours: s.hour, minutes: s.minute }).toMillis(),
    end: day.plus({ hours: e.hour, minutes: e.minute }).toMillis(),
  };
}

/** Franjas de atención disponibles (antes de considerar turnos ocupados) para un día y sede. */
export function workingWindowsForDay(
  day: DateTime,
  locationId: number,
  input: Pick<EngineInput, "rules" | "exceptions" | "coverage">,
): Interval[] {
  const dayStart = day.startOf("day");
  const dayRange: Interval = { start: dayStart.toMillis(), end: dayStart.plus({ days: 1 }).toMillis() };
  const cov = input.coverage;
  if (cov?.allowedWeekdays.length && !cov.allowedWeekdays.includes(dayStart.weekday)) return [];

  let windows: Interval[] = input.rules
    .filter((r) => r.active !== false && r.locationId === locationId && r.weekday === dayStart.weekday)
    .map((r) => dayWindow(dayStart, r.startTime, r.endTime));

  const extras = input.exceptions
    .filter((e) => e.kind === "extra" && (e.locationId === null || e.locationId === locationId))
    .map((e) => ({ start: e.startAt, end: e.endAt }));
  windows = mergeIntervals([...windows, ...intersectIntervals(extras, [dayRange])]);

  const blocks = input.exceptions
    .filter((e) => BLOCKING_KINDS.has(e.kind) && (e.locationId === null || e.locationId === locationId))
    .map((e) => ({ start: e.startAt, end: e.endAt }));
  windows = subtractIntervals(windows, blocks);

  if (cov && (cov.timeFrom || cov.timeTo)) {
    windows = intersectIntervals(windows, [dayWindow(dayStart, cov.timeFrom ?? "00:00", cov.timeTo ?? "24:00")]);
  }
  return windows;
}

/** Calcula todos los turnos libres dentro de [from, to). */
export function computeSlots(input: EngineInput): Slot[] {
  const { tz, durationMinutes, bufferMinutes } = input;
  const step = Math.max(5, input.slotIntervalMinutes) * MIN;
  const dur = durationMinutes * MIN;
  const buf = bufferMinutes * MIN;
  const opens = input.opensAt ?? 0;
  const earliest = Math.max(input.from, earliestBookable(input.now, input.minNoticeHours), opens);
  const latest = Math.min(input.to, bookingHorizon(Math.max(input.now, opens), tz, input.maxAdvanceDays));
  if (latest <= earliest) return [];

  const locs = input.coverage?.allowedLocationIds.length
    ? input.locationIds.filter((id) => input.coverage!.allowedLocationIds.includes(id))
    : input.locationIds;

  const busy = mergeIntervals(input.busy);
  const isFree = (start: number, end: number) => {
    const probe = { start: start - buf, end: end + buf };
    return !busy.some((b) => overlaps(probe, b));
  };

  const slots: Slot[] = [];
  let day = DateTime.fromMillis(earliest, { zone: tz }).startOf("day");
  const lastDay = DateTime.fromMillis(latest, { zone: tz }).startOf("day");
  while (day <= lastDay) {
    for (const locationId of locs) {
      for (const w of workingWindowsForDay(day, locationId, input)) {
        for (let t = w.start; t + dur <= w.end; t += step) {
          if (t < earliest || t >= latest) continue;
          if (isFree(t, t + dur)) slots.push({ start: t, end: t + dur, locationId });
        }
      }
    }
    day = day.plus({ days: 1 });
  }
  return slots.sort((a, b) => a.start - b.start || a.locationId - b.locationId);
}

/**
 * Elige 3 sugerencias: la más próxima primero y luego, cuando se puede,
 * alternativas en otros días y en otra franja (mañana/tarde).
 */
export function pickSuggestions(slots: Slot[], tz: string, count = 3): Slot[] {
  if (slots.length <= count) return [...slots];
  const dayOf = (s: Slot) => DateTime.fromMillis(s.start, { zone: tz }).toISODate();
  const bandOf = (s: Slot) => (DateTime.fromMillis(s.start, { zone: tz }).hour < 13 ? "am" : "pm");
  const chosen: Slot[] = [slots[0]];
  const usedDays = new Set([dayOf(slots[0])]);
  const usedBands = new Set([bandOf(slots[0])]);
  const MAX_DETOUR = 3 * 24 * 60 * MIN;

  while (chosen.length < count) {
    const remaining = slots.filter((s) => !chosen.includes(s));
    if (remaining.length === 0) break;
    const firstNewDay = remaining.find((s) => !usedDays.has(dayOf(s)));
    let pick: Slot;
    if (!firstNewDay) pick = remaining[0];
    else {
      const newBand = remaining.find(
        (s) =>
          !usedDays.has(dayOf(s)) && !usedBands.has(bandOf(s)) && s.start <= firstNewDay.start + MAX_DETOUR,
      );
      pick = newBand ?? firstNewDay;
    }
    chosen.push(pick);
    usedDays.add(dayOf(pick));
    usedBands.add(bandOf(pick));
  }
  return chosen.sort((a, b) => a.start - b.start);
}

/**
 * Momento de envío de un recordatorio: N horas antes, ajustado a la franja horaria
 * permitida para mensajes. Devuelve null si ya pasó.
 */
export function reminderSendTime(
  appointmentStart: number,
  hoursBefore: number,
  now: number,
  tz: string,
  windowStart: string,
  windowEnd: string,
): number | null {
  const target = DateTime.fromMillis(appointmentStart - hoursBefore * 60 * MIN, { zone: tz });
  const day = target.startOf("day");
  const ws = dayWindow(day, windowStart, windowEnd);
  let t = target.toMillis();
  if (t < ws.start) t = ws.start;
  if (t > ws.end) t = ws.end;
  // Nunca después del turno ni dentro de las 2 horas previas
  if (t > appointmentStart - 2 * 60 * MIN) return null;
  if (t <= now) return null;
  return t;
}
