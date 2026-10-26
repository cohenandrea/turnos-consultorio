"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { appointments, notifications } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { bool, num, runAction, str } from "@/lib/admin-action";
import { AppError } from "@/lib/errors";
import { syncAppointment } from "@/lib/google/sync";
import { processOutbox } from "@/lib/messaging/outbox";
import { localToMs } from "@/lib/time";
import { dniSchema, optionalEmail, phoneSchema } from "@/lib/validation";
import { bookAppointment, cancelAppointment, regenerateManageToken, rescheduleAppointment, setAppointmentStatus } from "@/lib/services/booking";
import { getSettings } from "@/lib/services/config";
import { afterAppointmentChange } from "@/lib/services/jobs";

export async function createAppointmentAction(f: FormData) {
  const admin = await requireAdmin();
  await runAction("/admin/turnos/nuevo", async () => {
    const s = await getSettings();
    const date = str(f, "date");
    const time = str(f, "time");
    if (!date || !time) throw new AppError("INVALID_INPUT", "Elegí fecha y hora.");
    const fullName = str(f, "fullName");
    if (fullName.length < 3) throw new AppError("INVALID_INPUT", "Ingresá nombre y apellido.");
    const r = await bookAppointment({
      coverageId: num(f, "coverageId"),
      consultationTypeId: num(f, "consultationTypeId"),
      locationId: num(f, "locationId"),
      start: localToMs(date, time, s.timezone),
      patient: {
        fullName,
        dni: dniSchema.parse(str(f, "dni")),
        phone: phoneSchema.parse(str(f, "phone")),
        email: optionalEmail.parse(str(f, "email")),
        memberNumber: str(f, "memberNumber") || null,
      },
      consentReminders: bool(f, "consentReminders"),
      privacyAccepted: false,
      source: "admin",
      actor: { type: "admin", id: admin.id },
      force: bool(f, "force"),
      adminNotes: str(f, "adminNotes") || null,
    });
    after(() => afterAppointmentChange(r.appointment.id));
    revalidatePath("/admin");
    return { redirect: `/admin/turnos/${r.appointment.id}`, message: "Turno creado" };
  });
}

export async function cancelAction(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id");
  await runAction(`/admin/turnos/${id}`, async () => {
    const a = await cancelAppointment(id, { type: "admin", id: admin.id }, { notify: bool(f, "notify") });
    after(() => afterAppointmentChange(a.id, { start: a.startAt, end: a.endAt }));
    return "Turno cancelado. El horario quedó libre.";
  });
}

export async function rescheduleAction(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id");
  await runAction(`/admin/turnos/${id}`, async () => {
    const s = await getSettings();
    const r = await rescheduleAppointment(id, localToMs(str(f, "date"), str(f, "time"), s.timezone), num(f, "locationId"), { type: "admin", id: admin.id }, { force: bool(f, "force") });
    after(() => afterAppointmentChange(id, { start: r.previous.startAt, end: r.previous.endAt }));
    return "Turno reprogramado y paciente notificada.";
  });
}

export async function statusAction(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id");
  await runAction(`/admin/turnos/${id}`, async () => {
    const status = str(f, "status");
    if (status !== "completed" && status !== "no_show") throw new AppError("INVALID_INPUT", "Estado inválido.");
    await setAppointmentStatus(id, status, { type: "admin", id: admin.id });
  });
}

export async function reviewedAction(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id");
  await runAction(`/admin/turnos/${id}`, async () => {
    await db.update(appointments).set({ needsReview: false, reviewReason: null }).where(eq(appointments.id, id));
    await audit({ type: "admin", id: admin.id }, "appointment.reviewed", "appointment", id);
    return "Marcado como revisado.";
  });
}

export async function resyncAction(f: FormData) {
  await requireAdmin();
  const id = str(f, "id");
  await runAction(`/admin/turnos/${id}`, async () => {
    await db
      .update(appointments)
      .set({ googleSyncStatus: "pending", googleSyncAttempts: 0, googleNextAttemptAt: null, syncVersion: sql`${appointments.syncVersion} + 1` })
      .where(eq(appointments.id, id));
    const r = await syncAppointment(id);
    if (r === "error") throw new AppError("INVALID_STATE", "Google Calendar devolvió un error. Mirá el detalle abajo.");
    if (r === "not_connected") throw new AppError("INVALID_STATE", "Google Calendar no está conectado.");
    return "Sincronizado con Google Calendar.";
  });
}

export async function regenerateLinkAction(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id");
  await runAction(`/admin/turnos/${id}`, async () => {
    await regenerateManageToken(id, { type: "admin", id: admin.id });
    return "Se generó un enlace nuevo. El anterior dejó de funcionar.";
  });
}

export async function resendConfirmationAction(f: FormData) {
  await requireAdmin();
  const id = str(f, "id");
  await runAction(`/admin/turnos/${id}`, async () => {
    const [a] = await db.select().from(appointments).where(eq(appointments.id, id));
    if (!a || a.status !== "confirmed") throw new AppError("INVALID_STATE", "El turno no está confirmado.");
    const { channelsFor } = await import("@/lib/messaging/outbox");
    const chans = channelsFor("confirmation", { phone: a.contactPhone, email: a.contactEmail });
    if (!chans.length) throw new AppError("INVALID_STATE", "No hay canales de mensajería configurados.");
    for (const channel of chans) {
      await db
        .insert(notifications)
        .values({
          appointmentId: a.id,
          kind: "confirmation",
          channel,
          recipient: channel === "whatsapp" ? a.contactPhone : a.contactEmail!,
          payload: { startAt: String(a.startAt.getTime()) },
          scheduledFor: new Date(),
          dedupeKey: `${a.id}:manual:${Date.now()}:${channel}`,
        })
        .onConflictDoNothing();
    }
    await processOutbox(10);
    return "Confirmación reenviada.";
  });
}

export async function notesAction(f: FormData) {
  await requireAdmin();
  const id = str(f, "id");
  await runAction(`/admin/turnos/${id}`, async () => {
    await db.update(appointments).set({ adminNotes: str(f, "adminNotes").slice(0, 1000) || null }).where(eq(appointments.id, id));
    return "Nota guardada.";
  });
}
