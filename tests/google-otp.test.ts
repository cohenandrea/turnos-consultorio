import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const sentEmails: { to: string; text: string }[] = [];
vi.mock("@/lib/messaging/email", () => ({
  sendEmail: vi.fn(async (o: { to: string; text: string }) => {
    sentEmails.push(o);
    return { id: "x" };
  }),
}));

import { db, closeDb } from "@/db";
import { appointments, googleIntegration, settings } from "@/db/schema";
import { encrypt } from "@/lib/security";
import { bookAppointment, cancelAppointment } from "@/lib/services/booking";
import { findSlots } from "@/lib/services/availability-service";
import { clearBusyCache, eventIdFor, pullExternalChanges, reconcilePending, syncAppointment } from "@/lib/google/sync";
import { resetTokenCache } from "@/lib/google/api";
import { requestOtp, verifyOtp } from "@/lib/services/otp";
import { at, nextWeekday, patient, resetDb } from "./helpers";

type Call = { method: string; url: string; body?: any };
const calls: Call[] = [];
const google = {
  events: [] as any[],
  failInsert: false,
  failList: false,
};

function json(status: number, body: unknown) {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = init?.body && typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : undefined;
  calls.push({ method, url, body });
  if (url.startsWith("https://oauth2.googleapis.com/token")) return json(200, { access_token: "at", expires_in: 3600 });
  if (url.includes("/events")) {
    if (method === "GET") return google.failList ? json(503, { error: { message: "Backend Error" } }) : json(200, { items: google.events });
    if (method === "POST") return google.failInsert ? json(500, { error: { message: "Internal" } }) : json(200, { id: body.id });
    if (method === "PATCH") return json(200, { id: url.split("/events/")[1] });
    if (method === "DELETE") return json(204, null);
  }
  return json(404, {});
});

const book = (start: number, consult = 2) =>
  bookAppointment({
    coverageId: 1,
    consultationTypeId: consult,
    locationId: 1,
    start,
    patient: patient({ fullName: "Ana Gómez", email: "ana@example.com" }),
    consentReminders: true,
    privacyAccepted: true,
    source: "web",
    actor: { type: "patient" },
  });

beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = "cid";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  process.env.SMTP_HOST = "smtp.test";
  process.env.EMAIL_FROM = "turnos@test";
  await resetDb();
  await db.update(settings).set({ minNoticeHours: 0, maxActivePerPatient: 0 });
  await db.update(googleIntegration).set({ refreshTokenEnc: encrypt("rt"), calendarId: "agenda@group.calendar.google.com" });
  vi.stubGlobal("fetch", fetchMock);
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await closeDb();
});
beforeEach(() => {
  calls.length = 0;
  google.events = [];
  google.failInsert = false;
  google.failList = false;
  clearBusyCache();
  resetTokenCache();
});

describe("Google Calendar", () => {
  it("un evento cargado en Google bloquea ese horario", async () => {
    const day = nextWeekday(4);
    google.events = [{ id: "personal", status: "confirmed", start: { dateTime: new Date(at(day, "10:00")).toISOString() }, end: { dateTime: new Date(at(day, "11:00")).toISOString() } }];
    const r = await findSlots({ coverageId: 1, consultationTypeId: 2, from: at(day, "00:00"), to: at(day, "23:59") });
    const starts = r.slots.map((s) => s.start);
    expect(starts).not.toContain(at(day, "10:00"));
    expect(starts).not.toContain(at(day, "10:30"));
    expect(starts).toContain(at(day, "11:00"));
  });

  it("los eventos de día completo bloquean el día (vacaciones cargadas en Google)", async () => {
    const day = nextWeekday(4);
    const { DateTime } = await import("luxon");
    const next = DateTime.fromISO(day).plus({ days: 1 }).toISODate();
    google.events = [{ id: "vac", transparency: "transparent", start: { date: day }, end: { date: next } }];
    const r = await findSlots({ coverageId: 1, consultationTypeId: 2, from: at(day, "00:00"), to: at(day, "23:59") });
    expect(r.slots).toHaveLength(0);
  });

  it("crea el evento sin datos sensibles y guarda su id", async () => {
    const r = await book(at(nextWeekday(5), "09:00"));
    expect(await syncAppointment(r.appointment.id)).toBe("synced");
    const insert = calls.find((c) => c.method === "POST" && c.url.includes("/events"))!;
    expect(insert.body.id).toBe(eventIdFor(r.appointment.id));
    expect(insert.body.summary).toBe("Turno: Ana Gómez");
    expect(insert.body.visibility).toBe("private");
    const all = JSON.stringify(insert.body);
    expect(all).not.toContain("ana@example.com");
    expect(all).not.toMatch(/549\d+/);
    expect(insert.body.start.timeZone).toBe("America/Argentina/Buenos_Aires");
    const [a] = await db.select().from(appointments).where(eq(appointments.id, r.appointment.id));
    expect(a.googleEventId).toBe(eventIdFor(r.appointment.id));
    expect(a.googleSyncStatus).toBe("synced");
  });

  it("si Google falla, el turno queda guardado y se reintenta después", async () => {
    const r = await book(at(nextWeekday(5), "09:30"));
    google.failInsert = true;
    expect(await syncAppointment(r.appointment.id)).toBe("error");
    let [a] = await db.select().from(appointments).where(eq(appointments.id, r.appointment.id));
    expect(a.status).toBe("confirmed");
    expect(a.googleSyncStatus).toBe("error");
    expect(a.googleSyncAttempts).toBe(1);
    google.failInsert = false;
    await db.update(appointments).set({ googleNextAttemptAt: null }).where(eq(appointments.id, r.appointment.id));
    await reconcilePending();
    [a] = await db.select().from(appointments).where(eq(appointments.id, r.appointment.id));
    expect(a.googleSyncStatus).toBe("synced");
  });

  it("al cancelar se elimina el evento", async () => {
    const r = await book(at(nextWeekday(5), "10:00"));
    await syncAppointment(r.appointment.id);
    await cancelAppointment(r.appointment.id, { type: "patient" });
    calls.length = 0;
    expect(await syncAppointment(r.appointment.id)).toBe("synced");
    expect(calls.some((c) => c.method === "DELETE" && c.url.includes(eventIdFor(r.appointment.id)))).toBe(true);
  });

  it("un cambio mientras se sincroniza no se pierde", async () => {
    const r = await book(at(nextWeekday(5), "10:30"));
    // Simulamos que el turno cambió (syncVersion) durante la sincronización
    fetchMock.mockImplementationOnce(async (input, init) => {
      await db.update(appointments).set({ syncVersion: 99 }).where(eq(appointments.id, r.appointment.id));
      return json(200, { access_token: "at", expires_in: 3600 });
    });
    await syncAppointment(r.appointment.id);
    const [a] = await db.select().from(appointments).where(eq(appointments.id, r.appointment.id));
    expect(a.googleSyncStatus).not.toBe("synced");
  });

  it("si Google no responde al reservar, se reserva igual y se marca para revisión", async () => {
    google.failList = true;
    const r = await book(at(nextWeekday(6), "17:00"));
    expect(r.appointment.needsReview).toBe(true);
    expect(r.appointment.reviewReason).toContain("Google Calendar");
  });

  it("detecta eventos de turnos eliminados o movidos en Google", async () => {
    const a = await book(at(nextWeekday(6), "11:00"));
    const b = await book(at(nextWeekday(6), "11:30"));
    await syncAppointment(a.appointment.id);
    await syncAppointment(b.appointment.id);
    const mark = (id: string) => ({ private: { turnosApp: "1", turnosAppId: id } });
    google.events = [
      { id: eventIdFor(a.appointment.id), status: "cancelled", extendedProperties: mark(a.appointment.id) },
      {
        id: eventIdFor(b.appointment.id),
        status: "confirmed",
        start: { dateTime: new Date(at(nextWeekday(6), "12:00")).toISOString() },
        end: { dateTime: new Date(at(nextWeekday(6), "12:30")).toISOString() },
        extendedProperties: mark(b.appointment.id),
      },
    ];
    const deleted: string[] = [];
    const res = await pullExternalChanges(async (id) => void deleted.push(id));
    expect(res.flagged).toBe(2);
    const [ra] = await db.select().from(appointments).where(eq(appointments.id, a.appointment.id));
    const [rb] = await db.select().from(appointments).where(eq(appointments.id, b.appointment.id));
    expect(ra.needsReview).toBe(true);
    expect(rb.reviewReason).toContain("modificó en Google");
    expect(deleted).toHaveLength(0); // modo por defecto: revisión, no cancelación automática
  });
});

describe("recuperación de datos con código", () => {
  it("no revela si un correo está registrado", async () => {
    sentEmails.length = 0;
    await expect(requestOtp("email", "nadie@example.com", "1.1.1.1")).resolves.toEqual({ sent: true });
    expect(sentEmails).toHaveLength(0);
  });

  it("envía un código al correo registrado y devuelve los datos solo con el código correcto", async () => {
    sentEmails.length = 0;
    await requestOtp("email", "ANA@example.com", "1.1.1.2");
    expect(sentEmails).toHaveLength(1);
    const code = /\b(\d{6})\b/.exec(sentEmails[0].text)![1];
    const wrong = code === "000000" ? "111111" : "000000";
    await expect(verifyOtp("email", "ana@example.com", wrong, "1.1.1.2")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const ok = await verifyOtp("email", "ana@example.com", code, "1.1.1.2");
    expect(ok.patient.fullName).toBe("Ana Gómez");
    expect(ok.verificationToken).toBeTruthy();
    // El código no se puede reutilizar
    await expect(verifyOtp("email", "ana@example.com", code, "1.1.1.2")).rejects.toBeTruthy();
  });

  it("limita los intentos", async () => {
    await requestOtp("email", "ana@example.com", "1.1.1.3");
    await requestOtp("email", "ana@example.com", "1.1.1.3");
    await expect(requestOtp("email", "ana@example.com", "1.1.1.3")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
