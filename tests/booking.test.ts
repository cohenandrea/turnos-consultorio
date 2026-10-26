import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

const sentEmails: { to: string; text: string; subject: string }[] = [];
let emailShouldFail = false;
vi.mock("@/lib/messaging/email", () => ({
  sendEmail: vi.fn(async (o: { to: string; text: string; subject: string }) => {
    if (emailShouldFail) throw new Error("SMTP caído");
    sentEmails.push(o);
    return { id: "msg-" + sentEmails.length };
  }),
}));

import { db, closeDb } from "@/db";
import { appointments, notifications, settings } from "@/db/schema";
import { bookAppointment, cancelAppointment, findByToken, rescheduleAppointment } from "@/lib/services/booking";
import { findSlots, suggestSlots } from "@/lib/services/availability-service";
import { processOutbox } from "@/lib/messaging/outbox";
import { AppError } from "@/lib/errors";
import { at, nextWeekday, patient, resetDb } from "./helpers";

const COVERAGE = 1; // OSDE (seed)
const FIRST = 1; // Primera consulta, 40'
const CONTROL = 2; // Control, 30'
const LOC = 1;

function book(start: number, opts: Partial<Parameters<typeof bookAppointment>[0]> = {}) {
  return bookAppointment({
    coverageId: COVERAGE,
    consultationTypeId: CONTROL,
    locationId: LOC,
    start,
    patient: patient(),
    consentReminders: true,
    privacyAccepted: true,
    source: "web",
    actor: { type: "patient" },
    ...opts,
  });
}

beforeAll(async () => {
  process.env.SMTP_HOST = "smtp.test";
  process.env.EMAIL_FROM = "turnos@test";
  await resetDb();
  await db.update(settings).set({ minNoticeHours: 0, maxActivePerPatient: 0 });
});
afterAll(async () => {
  await closeDb();
});
beforeEach(() => {
  sentEmails.length = 0;
  emailShouldFail = false;
});

describe("reservas", () => {
  it("sugiere tres turnos reales", async () => {
    const r = await suggestSlots({ coverageId: COVERAGE, consultationTypeId: CONTROL });
    expect(r.suggestions).toHaveLength(3);
    expect(r.suggestions[0].start).toBeGreaterThan(Date.now());
  });

  it("reservas simultáneas del mismo horario: solo una gana", async () => {
    const day = nextWeekday(4);
    const start = at(day, "10:00");
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => book(start)));
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(9);
    for (const f of failed) expect(["SLOT_TAKEN", "SLOT_UNAVAILABLE"]).toContain((f.reason as AppError).code);
    const rows = await db.select().from(appointments).where(and(eq(appointments.startAt, new Date(start)), eq(appointments.status, "confirmed")));
    expect(rows).toHaveLength(1);
  });

  it("la base impide superposiciones aunque se fuerce (turnos de distinta duración)", async () => {
    const day = nextWeekday(5);
    await book(at(day, "11:00"), { consultationTypeId: FIRST }); // 11:00–11:40
    const slots = await findSlots({ coverageId: COVERAGE, consultationTypeId: CONTROL, from: at(day, "00:00"), to: at(day, "23:59") });
    expect(slots.slots.map((s) => s.start)).not.toContain(at(day, "11:30"));
    await expect(book(at(day, "11:30"), { force: true, source: "admin", actor: { type: "admin" } })).rejects.toMatchObject({ code: "SLOT_TAKEN" });
  });

  it("programa confirmación y recordatorios sin duplicados", async () => {
    const r = await book(at(nextWeekday(6), "09:00"));
    const n = await db.select().from(notifications).where(eq(notifications.appointmentId, r.appointment.id));
    expect(n.map((x) => x.kind).sort()).toEqual(["confirmation", "reminder_24", "reminder_48"]);
    expect(n.every((x) => x.channel === "email")).toBe(true);
    const { enqueueAppointmentMessages } = await import("@/lib/messaging/outbox");
    const [s] = await db.select().from(settings);
    await db.transaction((tx) => enqueueAppointmentMessages(tx, r.appointment, ["confirmation", "reminder_48"], s));
    const again = await db.select().from(notifications).where(eq(notifications.appointmentId, r.appointment.id));
    expect(again).toHaveLength(3);
  });

  it("el enlace de gestión funciona y no expone datos en la URL", async () => {
    const r = await book(at(nextWeekday(6), "09:30"));
    expect(r.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect((await findByToken(r.token))?.id).toBe(r.appointment.id);
    expect(await findByToken("x".repeat(43))).toBeNull();
  });
});

describe("cancelación", () => {
  it("libera el horario, cancela recordatorios y avisa", async () => {
    const day = nextWeekday(7);
    const start = at(day, "15:00");
    const r = await book(start);
    await cancelAppointment(r.appointment.id, { type: "patient" }, { enforcePolicy: true });
    const slots = await findSlots({ coverageId: COVERAGE, consultationTypeId: CONTROL, from: at(day, "00:00"), to: at(day, "23:59") });
    expect(slots.slots.map((s) => s.start)).toContain(start);
    const n = await db.select().from(notifications).where(eq(notifications.appointmentId, r.appointment.id));
    expect(n.filter((x) => x.kind.startsWith("reminder")).every((x) => x.status === "cancelled")).toBe(true);
    expect(n.find((x) => x.kind === "cancellation")?.status).toBe("pending");
    // Otra paciente puede reservar el horario liberado
    await expect(book(start)).resolves.toBeTruthy();
  });

  it("respeta el límite de horas para cancelar online", async () => {
    await db.update(settings).set({ cancelLimitHours: 24 * 30 });
    const r = await book(at(nextWeekday(7), "16:00"));
    await expect(cancelAppointment(r.appointment.id, { type: "patient" }, { enforcePolicy: true })).rejects.toMatchObject({ code: "TOO_LATE" });
    await db.update(settings).set({ cancelLimitHours: 24 });
  });
});

describe("reprogramación", () => {
  it("mueve el turno, libera el anterior y reprograma recordatorios", async () => {
    const day = nextWeekday(8);
    const r = await book(at(day, "09:00"));
    const res = await rescheduleAppointment(r.appointment.id, at(day, "12:00"), LOC, { type: "patient" }, { enforcePolicy: true });
    expect(res.appointment.startAt.getTime()).toBe(at(day, "12:00"));
    expect(res.appointment.rescheduleCount).toBe(1);
    const n = await db.select().from(notifications).where(eq(notifications.appointmentId, r.appointment.id));
    const pendingReminders = n.filter((x) => x.kind.startsWith("reminder") && x.status === "pending");
    expect(pendingReminders.every((x) => x.payload?.startAt === String(at(day, "12:00")))).toBe(true);
    expect(n.some((x) => x.kind === "reschedule")).toBe(true);
    await expect(book(at(day, "09:00"))).resolves.toBeTruthy();
  });

  it("permite mover un turno a un horario que se superpone consigo mismo", async () => {
    const day = nextWeekday(8);
    const r = await book(at(day, "16:00"), { consultationTypeId: FIRST }); // 16:00–16:40
    await db.update(settings).set({ slotIntervalMinutes: 15 });
    const res = await rescheduleAppointment(r.appointment.id, at(day, "16:15"), LOC, { type: "patient" });
    expect(res.appointment.startAt.getTime()).toBe(at(day, "16:15"));
    await db.update(settings).set({ slotIntervalMinutes: 30 });
  });

  it("si el nuevo horario está ocupado, el turno original queda intacto", async () => {
    const day = nextWeekday(9);
    const a = await book(at(day, "09:00"));
    await book(at(day, "10:00"));
    await expect(rescheduleAppointment(a.appointment.id, at(day, "10:00"), LOC, { type: "patient" })).rejects.toMatchObject({
      code: "SLOT_UNAVAILABLE",
    });
    await expect(rescheduleAppointment(a.appointment.id, at(day, "10:00"), LOC, { type: "admin" }, { force: true })).rejects.toMatchObject({
      code: "SLOT_TAKEN",
    });
    const [after] = await db.select().from(appointments).where(eq(appointments.id, a.appointment.id));
    expect(after.status).toBe("confirmed");
    expect(after.startAt.getTime()).toBe(at(day, "09:00"));
    const n = await db.select().from(notifications).where(eq(notifications.appointmentId, a.appointment.id));
    expect(n.filter((x) => x.status === "pending")).toHaveLength(3);
  });
});

describe("envío de mensajes", () => {
  it("envía los mensajes vencidos e incluye el enlace de gestión", async () => {
    await db.update(notifications).set({ status: "cancelled" }).where(eq(notifications.status, "pending"));
    const r = await book(at(nextWeekday(10), "11:00"));
    const out = await processOutbox();
    expect(out.sent).toBe(1); // solo la confirmación; los recordatorios son a futuro
    expect(sentEmails[0].text).toContain(`https://turnos.test/t/${r.token}`);
    expect(sentEmails[0].text).toMatch(/Hola, Paciente\. Tu turno con .* quedó confirmado/);
  });

  it("registra fallos y reintenta", async () => {
    await book(at(nextWeekday(10), "11:30"));
    emailShouldFail = true;
    await processOutbox();
    let [n] = await db.select().from(notifications).where(eq(notifications.status, "pending"));
    expect(n.attempts).toBe(1);
    expect(n.lastError).toContain("SMTP caído");
    for (let i = 0; i < 5; i++) {
      await db.update(notifications).set({ nextAttemptAt: null }).where(eq(notifications.id, n.id));
      await processOutbox();
    }
    [n] = await db.select().from(notifications).where(eq(notifications.id, n.id));
    expect(n.status).toBe("failed");
  });

  it("no envía recordatorios de turnos cancelados", async () => {
    const r = await book(at(nextWeekday(11), "09:00"));
    await processOutbox();
    // Forzamos que el recordatorio esté "vencido" y luego cancelamos de manera directa en la base
    await db.update(notifications).set({ scheduledFor: new Date(Date.now() - 1000) }).where(eq(notifications.appointmentId, r.appointment.id));
    await db.update(appointments).set({ status: "cancelled" }).where(eq(appointments.id, r.appointment.id));
    sentEmails.length = 0;
    await processOutbox();
    expect(sentEmails).toHaveLength(0);
  });
});
