/**
 * Sincronización con Google Calendar.
 * - Saliente: cada turno tiene un "estado deseado" y se reconcilia (con reintentos) hasta quedar "synced".
 * - Entrante: los eventos propios del calendario bloquean horarios; los eventos de turnos
 *   modificados o eliminados en Google se marcan para revisión (o se cancelan, según configuración).
 */
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import { appointments, consultationTypes, coverages, googleIntegration, locations, type Appointment } from "@/db/schema";
import type { Interval } from "@/lib/availability";
import { env } from "@/lib/env";
import { formatShort } from "@/lib/time";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/services/config";
import {
  deleteEvent,
  freeBusy,
  getIntegration,
  GoogleApiError,
  insertEvent,
  isGoogleReady,
  listEvents,
  patchEvent,
  type GEvent,
} from "./api";

const APP_MARK = "turnosApp";
const MAX_ATTEMPTS = 8;

async function recordError(message: string) {
  await db.update(googleIntegration).set({ lastError: message, lastErrorAt: new Date() }).where(eq(googleIntegration.id, 1));
}

// ---------------------------------------------------------------------------
// Ocupación de Google → disponibilidad
// ---------------------------------------------------------------------------

const busyCache = new Map<string, { at: number; busy: Interval[] }>();
const CACHE_MS = 60_000;
const STALE_OK_MS = 10 * 60_000;

export type GoogleBusyResult = { busy: Interval[]; used: boolean; ok: boolean };

function eventInterval(e: GEvent, tz: string, allDayBlocks: boolean): Interval | null {
  if (e.status === "cancelled") return null;
  if (e.extendedProperties?.private?.[APP_MARK] === "1") return null; // turnos propios: ya están en la base
  if (e.start?.date && e.end?.date) {
    if (!allDayBlocks && e.transparency === "transparent") return null;
    return {
      start: DateTime.fromISO(e.start.date, { zone: tz }).toMillis(),
      end: DateTime.fromISO(e.end.date, { zone: tz }).toMillis(),
    };
  }
  if (e.transparency === "transparent") return null;
  if (!e.start?.dateTime || !e.end?.dateTime) return null;
  return { start: Date.parse(e.start.dateTime), end: Date.parse(e.end.dateTime) };
}

export async function getGoogleBusy(from: number, to: number, opts: { fresh?: boolean } = {}): Promise<GoogleBusyResult> {
  if (!(await isGoogleReady())) return { busy: [], used: false, ok: true };
  const key = `${from}:${to}`;
  const cached = busyCache.get(key);
  if (!opts.fresh && cached && Date.now() - cached.at < CACHE_MS) return { busy: cached.busy, used: true, ok: true };
  try {
    const [g, s] = await Promise.all([getIntegration(), getSettings()]);
    const timeMin = new Date(from).toISOString();
    const timeMax = new Date(to).toISOString();
    const events = await listEvents(g!.calendarId!, { timeMin, timeMax, showDeleted: "false" });
    const busy = events.map((e) => eventInterval(e, s.timezone, s.googleAllDayBlocks)).filter((x): x is Interval => !!x);
    if (g!.extraBusyCalendarIds.length) {
      const fb = await freeBusy(g!.extraBusyCalendarIds, timeMin, timeMax);
      for (const cal of Object.values(fb.calendars ?? {})) {
        for (const b of cal.busy ?? []) busy.push({ start: Date.parse(b.start), end: Date.parse(b.end) });
      }
    }
    busyCache.set(key, { at: Date.now(), busy });
    if (busyCache.size > 200) busyCache.delete(busyCache.keys().next().value!);
    return { busy, used: true, ok: true };
  } catch (e) {
    await recordError(`Lectura de disponibilidad: ${(e as Error).message}`);
    if (cached && Date.now() - cached.at < STALE_OK_MS) return { busy: cached.busy, used: true, ok: true };
    return { busy: [], used: true, ok: false };
  }
}

export function clearBusyCache() {
  busyCache.clear();
}

// ---------------------------------------------------------------------------
// Turno → evento de Google
// ---------------------------------------------------------------------------

/** ID de evento determinístico (base32hex) para que crear sea idempotente. */
export function eventIdFor(appointmentId: string) {
  return "ta" + appointmentId.replace(/-/g, "");
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + ".")
    .join(" ");
}

async function buildEventBody(appt: Appointment) {
  const s = await getSettings();
  const [[type], [cov], [loc]] = await Promise.all([
    db.select().from(consultationTypes).where(eq(consultationTypes.id, appt.consultationTypeId)),
    db.select().from(coverages).where(eq(coverages.id, appt.coverageId)),
    db.select().from(locations).where(eq(locations.id, appt.locationId)),
  ]);
  const who = s.eventTitleFormat === "initials" ? initials(appt.contactName) : appt.contactName;
  // Sin datos clínicos ni de contacto: solo lo administrativo necesario + enlace al panel privado.
  const description = [
    `Cobertura: ${cov?.name ?? "-"}`,
    `Tipo: ${type?.name ?? "-"}`,
    `Ver en el panel: ${env.appUrl()}/admin/turnos/${appt.id}`,
  ].join("\n");
  return {
    summary: `Turno: ${who}`,
    description,
    location: loc?.address,
    start: { dateTime: appt.startAt.toISOString(), timeZone: s.timezone },
    end: { dateTime: appt.endAt.toISOString(), timeZone: s.timezone },
    visibility: "private",
    transparency: "opaque",
    status: "confirmed",
    extendedProperties: { private: { [APP_MARK]: "1", turnosAppId: appt.id } },
  };
}

/** Toma un "permiso" exclusivo de ~60 s para sincronizar este turno (evita dobles creaciones). */
async function claim(id: string) {
  const rows = await db
    .update(appointments)
    .set({ googleNextAttemptAt: sql`now() + interval '60 seconds'` })
    .where(and(eq(appointments.id, id), or(isNull(appointments.googleNextAttemptAt), lte(appointments.googleNextAttemptAt, sql`now()`))))
    .returning();
  return rows[0] ?? null;
}

export async function syncAppointment(id: string): Promise<"synced" | "skipped" | "error" | "not_connected"> {
  if (!(await isGoogleReady())) {
    await db
      .update(appointments)
      .set({ googleSyncStatus: "not_connected" })
      .where(and(eq(appointments.id, id), eq(appointments.googleSyncStatus, "pending")));
    return "not_connected";
  }
  const appt = await claim(id);
  if (!appt) return "skipped";
  const g = await getIntegration();
  const calendarId = appt.googleCalendarId ?? g!.calendarId!;
  try {
    let eventId = appt.googleEventId;
    if (appt.status === "confirmed") {
      const body = await buildEventBody(appt);
      if (eventId) {
        try {
          await patchEvent(calendarId, eventId, body);
        } catch (e) {
          if (!(e instanceof GoogleApiError && (e.status === 404 || e.status === 410))) throw e;
          eventId = null; // el evento ya no existe: se vuelve a crear
        }
      }
      if (!eventId) {
        const newId = appt.googleEventId ? eventIdFor(appt.id) + "r" + Date.now().toString(32) : eventIdFor(appt.id);
        try {
          eventId = (await insertEvent(calendarId, { ...body, id: newId })).id;
        } catch (e) {
          if (!(e instanceof GoogleApiError && e.status === 409)) throw e;
          // Ya existía (reintento): se actualiza y se restaura si estaba eliminado
          eventId = (await patchEvent(calendarId, newId, body)).id;
        }
      }
    } else {
      // Aunque no tengamos el id guardado, el evento pudo crearse (id determinístico)
      eventId = eventId ?? eventIdFor(appt.id);
      const s = await getSettings();
      try {
        if (s.googleOnCancel === "delete") await deleteEvent(calendarId, eventId);
        else
          await patchEvent(calendarId, eventId, {
            summary: `CANCELADO – Turno: ${appt.contactName}`,
            transparency: "transparent",
          });
      } catch (e) {
        if (!(e instanceof GoogleApiError && (e.status === 404 || e.status === 410))) throw e;
      }
    }
    await db
      .update(appointments)
      .set({
        googleEventId: eventId,
        googleCalendarId: calendarId,
        googleSyncStatus: "synced",
        googleSyncAttempts: 0,
        googleSyncError: null,
        googleNextAttemptAt: null,
      })
      // Si el turno cambió mientras sincronizábamos, queda "pending" para la próxima pasada
      .where(and(eq(appointments.id, id), eq(appointments.syncVersion, appt.syncVersion)));
    return "synced";
  } catch (e) {
    const attempts = appt.googleSyncAttempts + 1;
    const backoffMin = Math.min(2 ** attempts, 240);
    const msg = (e as Error).message;
    await db
      .update(appointments)
      .set({
        googleSyncStatus: "error",
        googleSyncAttempts: attempts,
        googleSyncError: msg.slice(0, 500),
        googleNextAttemptAt: new Date(Date.now() + backoffMin * 60_000),
        ...(attempts >= MAX_ATTEMPTS ? { needsReview: true, reviewReason: "No se pudo sincronizar con Google Calendar." } : {}),
      })
      .where(and(eq(appointments.id, id), eq(appointments.syncVersion, appt.syncVersion)));
    await recordError(`Turno ${id.slice(0, 8)}: ${msg}`);
    return "error";
  }
}

/** Reintenta todos los turnos con sincronización pendiente o fallida. */
export async function reconcilePending(limit = 50) {
  if (!(await isGoogleReady())) return { processed: 0 };
  const rows = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        inArray(appointments.googleSyncStatus, ["pending", "error", "not_connected"]),
        lte(appointments.googleSyncAttempts, MAX_ATTEMPTS - 1),
        or(isNull(appointments.googleNextAttemptAt), lte(appointments.googleNextAttemptAt, sql`now()`)),
        // No hace falta crear eventos de turnos pasados que nunca se sincronizaron
        or(eq(appointments.status, "cancelled"), sql`${appointments.endAt} > now() - interval '1 day'`),
      ),
    )
    .limit(limit);
  const results: Record<string, number> = {};
  for (const r of rows) {
    const res = await syncAppointment(r.id);
    results[res] = (results[res] ?? 0) + 1;
  }
  return { processed: rows.length, ...results };
}

/**
 * Detecta cambios hechos directamente en Google Calendar sobre eventos de turnos.
 * `onDeleted` se inyecta para evitar dependencias circulares con el servicio de reservas.
 */
export async function pullExternalChanges(onDeleted: (appointmentId: string) => Promise<void>) {
  if (!(await isGoogleReady())) return { checked: 0, flagged: 0 };
  const [g, s] = await Promise.all([getIntegration(), getSettings()]);
  const query: Record<string, string> = {
    privateExtendedProperty: `${APP_MARK}=1`,
    showDeleted: "true",
    timeMin: new Date(Date.now() - 24 * 3600_000).toISOString(),
  };
  if (g!.lastSyncAt) query.updatedMin = new Date(g!.lastSyncAt.getTime() - 10 * 60_000).toISOString();
  const startedAt = new Date();
  let events: GEvent[];
  try {
    events = await listEvents(g!.calendarId!, query);
  } catch (e) {
    await recordError(`Lectura de cambios: ${(e as Error).message}`);
    throw e;
  }
  let flagged = 0;
  for (const e of events) {
    const apptId = e.extendedProperties?.private?.turnosAppId;
    if (!apptId) continue;
    const [appt] = await db.select().from(appointments).where(eq(appointments.id, apptId));
    if (!appt || appt.status !== "confirmed" || appt.googleEventId !== e.id || appt.googleSyncStatus !== "synced") continue;
    if (e.status === "cancelled") {
      if (s.googleExternalChange === "cancel") {
        await onDeleted(appt.id);
      } else {
        await flag(appt.id, "El evento fue eliminado en Google Calendar. Revisá si el turno sigue en pie.");
      }
      flagged++;
      continue;
    }
    const gStart = e.start?.dateTime ? Date.parse(e.start.dateTime) : null;
    const gEnd = e.end?.dateTime ? Date.parse(e.end.dateTime) : null;
    if (gStart !== appt.startAt.getTime() || gEnd !== appt.endAt.getTime()) {
      const nuevo = gStart ? formatShort(gStart, s.timezone) : "día completo";
      await flag(appt.id, `El horario se modificó en Google Calendar (nuevo: ${nuevo}). La paciente no fue avisada.`);
      flagged++;
    }
  }
  await db.update(googleIntegration).set({ lastSyncAt: startedAt }).where(eq(googleIntegration.id, 1));
  return { checked: events.length, flagged };
}

async function flag(id: string, reason: string) {
  await db.update(appointments).set({ needsReview: true, reviewReason: reason, updatedAt: new Date() }).where(eq(appointments.id, id));
  await audit({ type: "google" }, "appointment.flagged", "appointment", id, { reason });
}
