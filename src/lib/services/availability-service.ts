import { and, eq, gt, lt, ne } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import { appointments, scheduleExceptions, type Settings } from "@/db/schema";
import { bookingHorizon, computeSlots, pickSuggestions, type Slot } from "@/lib/availability";
import { getGoogleBusy } from "@/lib/google/sync";
import { formatDateLongCap, formatTime, localDateKey } from "@/lib/time";
import { durationFor, getActiveLocations, getActiveRules, getSettings, resolveCoverageAndType } from "./config";

export type SlotQuery = {
  coverageId: number;
  consultationTypeId: number;
  from?: number;
  to?: number;
  excludeAppointmentId?: string;
  freshGoogle?: boolean;
  /** Ignora la anticipación mínima (uso administrativo). */
  ignoreNotice?: boolean;
};

/** Primer instante en que se dan turnos y límite a futuro, según la configuración. */
export function bookingWindow(s: Settings, now = Date.now(), admin = false) {
  const opensAt = !admin && s.bookingStartDate ? DateTime.fromISO(s.bookingStartDate, { zone: s.timezone }).startOf("day").toMillis() : null;
  const opensFuture = opensAt && opensAt > now ? opensAt : null;
  return { opensAt: opensFuture, horizon: bookingHorizon(Math.max(now, opensFuture ?? 0), s.timezone, s.maxAdvanceDays) };
}

export async function findSlots(q: SlotQuery) {
  const [s, { coverage, type }, locs, rules] = await Promise.all([
    getSettings(),
    resolveCoverageAndType(q.coverageId, q.consultationTypeId),
    getActiveLocations(),
    getActiveRules(),
  ]);
  const now = Date.now();
  const from = Math.max(q.from ?? now, now);
  const win = bookingWindow(s, now, q.ignoreNotice);
  const to = Math.min(q.to ?? win.horizon, win.horizon);
  if (to <= from) return { slots: [] as Slot[], googleOk: true, tz: s.timezone, settings: s };

  const margin = 24 * 3600_000;
  const [exceptions, appts, google] = await Promise.all([
    db
      .select()
      .from(scheduleExceptions)
      .where(and(lt(scheduleExceptions.startAt, new Date(to + margin)), gt(scheduleExceptions.endAt, new Date(from - margin)))),
    db
      .select({ start: appointments.startAt, end: appointments.endAt })
      .from(appointments)
      .where(
        and(
          eq(appointments.status, "confirmed"),
          lt(appointments.startAt, new Date(to + margin)),
          gt(appointments.blockEndAt, new Date(from - margin)),
          q.excludeAppointmentId ? ne(appointments.id, q.excludeAppointmentId) : undefined,
        ),
      ),
    getGoogleBusy(from - margin, to + margin, { fresh: q.freshGoogle }),
  ]);

  const slots = computeSlots({
    now,
    tz: s.timezone,
    from,
    to,
    rules,
    exceptions: exceptions.map((e) => ({ kind: e.kind, startAt: e.startAt.getTime(), endAt: e.endAt.getTime(), locationId: e.locationId })),
    busy: [...appts.map((a) => ({ start: a.start.getTime(), end: a.end.getTime() })), ...google.busy],
    durationMinutes: durationFor(coverage, type),
    bufferMinutes: s.bufferMinutes,
    slotIntervalMinutes: s.slotIntervalMinutes,
    minNoticeHours: q.ignoreNotice ? 0 : s.minNoticeHours,
    maxAdvanceDays: s.maxAdvanceDays,
    opensAt: win.opensAt,
    locationIds: locs.map((l) => l.id),
    coverage,
  });
  return { slots, googleOk: google.ok, tz: s.timezone, settings: s };
}

/** Tres sugerencias: busca en bloques de 14 días hasta tener variedad o llegar al límite. */
export async function suggestSlots(q: Omit<SlotQuery, "from" | "to">, count = 3) {
  const s = await getSettings();
  const now = Date.now();
  const { horizon, opensAt } = bookingWindow(s, now);
  let from = Math.max(now, opensAt ?? 0);
  const all: Slot[] = [];
  let googleOk = true;
  while (from < horizon) {
    const to = Math.min(DateTime.fromMillis(from, { zone: s.timezone }).startOf("day").plus({ days: 14 }).toMillis(), horizon);
    const r = await findSlots({ ...q, from, to });
    googleOk &&= r.googleOk;
    all.push(...r.slots);
    const days = new Set(all.map((x) => localDateKey(x.start, s.timezone)));
    if (days.size >= count) break;
    from = to;
  }
  return { suggestions: pickSuggestions(all, s.timezone, count), googleOk, tz: s.timezone, hasAny: all.length > 0 };
}

/** ¿Este horario exacto sigue libre? (consulta fresca a Google) */
export async function isSlotAvailable(q: Omit<SlotQuery, "from" | "to"> & { start: number; locationId: number }) {
  const s = await getSettings();
  const day = DateTime.fromMillis(q.start, { zone: s.timezone }).startOf("day");
  const r = await findSlots({ ...q, from: day.toMillis(), to: day.plus({ days: 1 }).toMillis(), freshGoogle: true });
  return { ok: r.slots.some((x) => x.start === q.start && x.locationId === q.locationId), googleOk: r.googleOk };
}

/** Formato para enviar al navegador (fechas ya formateadas en la zona del consultorio). */
export function serializeSlot(slot: Slot, tz: string, locationNames?: Map<number, string>) {
  return {
    start: new Date(slot.start).toISOString(),
    end: new Date(slot.end).toISOString(),
    locationId: slot.locationId,
    locationName: locationNames?.get(slot.locationId),
    dateKey: localDateKey(slot.start, tz),
    dateLabel: formatDateLongCap(slot.start, tz),
    time: formatTime(slot.start, tz),
  };
}
export type SerializedSlot = ReturnType<typeof serializeSlot>;
