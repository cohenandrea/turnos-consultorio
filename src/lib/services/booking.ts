/**
 * Reservar, cancelar, reprogramar y confirmar asistencia.
 * Todas las operaciones son transaccionales; la restricción de exclusión de Postgres
 * es la garantía final contra reservas superpuestas (incluso con pedidos simultáneos).
 */
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { appointments, locations, patients, waitlist, type Appointment } from "@/db/schema";
import { audit, type Actor } from "@/lib/audit";
import { isGoogleConfigured } from "@/lib/env";
import { AppError, pgCode, PG_EXCLUSION_VIOLATION, PG_UNIQUE_VIOLATION } from "@/lib/errors";
import { cancelPendingMessages, enqueueAppointmentMessages } from "@/lib/messaging/outbox";
import { encrypt, randomToken, sha256 } from "@/lib/security";
import { isSlotAvailable } from "./availability-service";
import { durationFor, getSettings, resolveCoverageAndType } from "./config";

const MIN = 60_000;

export type PatientInput = {
  fullName: string;
  dni: string;
  phone: string; // normalizado
  email?: string | null;
  birthDate?: string | null; // yyyy-mm-dd
  memberNumber?: string | null;
};

export type BookInput = {
  coverageId: number;
  consultationTypeId: number;
  locationId: number;
  start: number;
  patient: PatientInput;
  consentReminders: boolean;
  privacyAccepted: boolean;
  /** Paciente verificada por código (OTP): se pueden actualizar sus datos guardados. */
  verifiedPatientId?: string | null;
  source: "web" | "admin";
  actor: Actor;
  /** Solo administración: permite reservar fuera del horario de atención. */
  force?: boolean;
  adminNotes?: string | null;
};

export function newManageToken() {
  const token = randomToken(32);
  return { token, hash: sha256(token), enc: encrypt(token) };
}

function slotTakenError() {
  return new AppError("SLOT_TAKEN", "Ese horario acaba de ser reservado por otra persona. Elegí otro, por favor.", 409);
}

async function upsertPatient(tx: Tx, input: BookInput) {
  const p = input.patient;
  const now = new Date();
  const [existing] = await tx.select().from(patients).where(eq(patients.dni, p.dni)).for("update");
  if (!existing) {
    const [created] = await tx
      .insert(patients)
      .values({
        fullName: p.fullName,
        dni: p.dni,
        phone: p.phone,
        email: p.email || null,
        birthDate: p.birthDate || null,
        coverageId: input.coverageId,
        memberNumber: p.memberNumber || null,
        consentReminders: input.consentReminders,
        consentAt: input.consentReminders ? now : null,
        privacyAcceptedAt: input.privacyAccepted ? now : null,
      })
      .returning();
    return { patient: created, mismatch: false };
  }
  const trusted = input.source === "admin" || input.verifiedPatientId === existing.id;
  if (trusted) {
    const [updated] = await tx
      .update(patients)
      .set({
        fullName: p.fullName,
        phone: p.phone,
        email: p.email || null,
        birthDate: p.birthDate || existing.birthDate,
        coverageId: input.coverageId,
        memberNumber: p.memberNumber || null,
        consentReminders: input.consentReminders,
        consentAt: input.consentReminders ? (existing.consentAt ?? now) : null,
        privacyAcceptedAt: input.privacyAccepted ? now : existing.privacyAcceptedAt,
        anonymizedAt: null,
        updatedAt: now,
      })
      .where(eq(patients.id, existing.id))
      .returning();
    return { patient: updated, mismatch: false };
  }
  // DNI ya registrado pero sin verificar identidad: NO se modifican los datos guardados.
  const mismatch = existing.phone !== p.phone || (existing.email ?? "") !== (p.email ?? "") || existing.fullName !== p.fullName;
  return { patient: existing, mismatch };
}

export async function bookAppointment(input: BookInput) {
  const s = await getSettings();
  const { coverage, type } = await resolveCoverageAndType(input.coverageId, input.consultationTypeId);
  const [loc] = await db.select().from(locations).where(eq(locations.id, input.locationId));
  if (!loc || !loc.active) throw new AppError("INVALID_INPUT", "La sede seleccionada no está disponible.");
  if (coverage.allowedLocationIds.length && !coverage.allowedLocationIds.includes(loc.id)) {
    throw new AppError("INVALID_INPUT", "Tu cobertura no se atiende en esa sede.");
  }
  if (coverage.requiresMemberNumber && !input.patient.memberNumber && input.source === "web") {
    throw new AppError("INVALID_INPUT", "Ingresá tu número de afiliada.");
  }
  if (input.source === "web" && !input.privacyAccepted) {
    throw new AppError("INVALID_INPUT", "Para reservar necesitás aceptar la política de privacidad.");
  }

  let googleOk = true;
  if (!input.force) {
    const check = await isSlotAvailable({ coverageId: coverage.id, consultationTypeId: type.id, start: input.start, locationId: loc.id, ignoreNotice: input.source === "admin" });
    if (!check.ok) throw new AppError("SLOT_UNAVAILABLE", "Ese horario ya no está disponible. Elegí otro, por favor.", 409);
    googleOk = check.googleOk;
  } else if (input.start < Date.now() - 12 * 3600_000) {
    throw new AppError("INVALID_INPUT", "No se pueden crear turnos tan en el pasado.");
  }

  const duration = durationFor(coverage, type);
  const start = new Date(input.start);
  const end = new Date(input.start + duration * MIN);
  const blockEnd = new Date(end.getTime() + s.bufferMinutes * MIN);
  const token = newManageToken();

  try {
    const appt = await db.transaction(async (tx) => {
      const { patient, mismatch } = await upsertPatient(tx, input);

      if (input.source === "web" && s.maxActivePerPatient > 0) {
        const [{ n }] = await tx
          .select({ n: count() })
          .from(appointments)
          .where(and(eq(appointments.patientId, patient.id), eq(appointments.status, "confirmed"), gt(appointments.startAt, new Date())));
        if (n >= s.maxActivePerPatient) {
          throw new AppError(
            "ALREADY_HAS_APPOINTMENT",
            "Ya tenés un turno reservado. Podés reprogramarlo desde el enlace que te enviamos al confirmarlo.",
            409,
          );
        }
      }

      const reasons: string[] = [];
      if (mismatch) reasons.push("Reserva con un DNI ya registrado y datos de contacto distintos (sin verificación).");
      if (!googleOk) reasons.push("No se pudo verificar Google Calendar al momento de reservar.");

      const [created] = await tx
        .insert(appointments)
        .values({
          patientId: patient.id,
          coverageId: coverage.id,
          consultationTypeId: type.id,
          locationId: loc.id,
          startAt: start,
          endAt: end,
          blockEndAt: blockEnd,
          status: "confirmed",
          source: input.source,
          contactName: input.patient.fullName,
          contactPhone: input.patient.phone,
          contactEmail: input.patient.email || null,
          memberNumber: input.patient.memberNumber || null,
          consentReminders: input.consentReminders,
          manageTokenHash: token.hash,
          manageTokenEnc: token.enc,
          googleSyncStatus: isGoogleConfigured() ? "pending" : "not_connected",
          needsReview: reasons.length > 0,
          reviewReason: reasons.join(" ") || null,
          adminNotes: input.adminNotes ?? null,
        })
        .returning();

      await enqueueAppointmentMessages(tx, created, ["confirmation", "reminder_48", "reminder_24"], s);
      await tx
        .update(waitlist)
        .set({ status: "booked" })
        .where(and(eq(waitlist.phone, input.patient.phone), sql`${waitlist.status} IN ('active','notified')`));
      await audit(input.actor, "appointment.created", "appointment", created.id, { source: input.source, start: start.toISOString(), forced: !!input.force }, tx);
      return created;
    });
    return { appointment: appt, token: token.token };
  } catch (e) {
    if (pgCode(e) === PG_EXCLUSION_VIOLATION) throw slotTakenError();
    if (pgCode(e) === PG_UNIQUE_VIOLATION) throw new AppError("SLOT_TAKEN", "Hubo un conflicto al guardar. Probá de nuevo.", 409);
    throw e;
  }
}

export async function findByToken(token: string) {
  if (!token || token.length < 20) return null;
  const [appt] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.manageTokenHash, sha256(token)), isNull(appointments.manageTokenRevokedAt)));
  return appt ?? null;
}

function hoursUntil(d: Date) {
  return (d.getTime() - Date.now()) / 3600_000;
}

export async function cancelAppointment(id: string, actor: Actor, opts: { enforcePolicy?: boolean; notify?: boolean } = {}) {
  const s = await getSettings();
  const appt = await db.transaction(async (tx) => {
    const [a] = await tx.select().from(appointments).where(eq(appointments.id, id)).for("update");
    if (!a) throw new AppError("NOT_FOUND", "No encontramos el turno.", 404);
    if (a.status !== "confirmed") throw new AppError("INVALID_STATE", "Este turno ya no está activo.");
    if (opts.enforcePolicy && hoursUntil(a.startAt) < s.cancelLimitHours) {
      throw new AppError(
        "TOO_LATE",
        `Los turnos se pueden cancelar online hasta ${s.cancelLimitHours} horas antes. Escribinos por WhatsApp y lo resolvemos.`,
      );
    }
    const [updated] = await tx
      .update(appointments)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledBy: actor.type,
        googleSyncStatus: isGoogleConfigured() ? "pending" : "not_connected",
        googleSyncAttempts: 0,
        googleNextAttemptAt: null,
        syncVersion: sql`${appointments.syncVersion} + 1`,
        needsReview: false,
        updatedAt: new Date(),
      })
      .where(eq(appointments.id, id))
      .returning();
    await cancelPendingMessages(tx, id);
    if (opts.notify !== false) await enqueueAppointmentMessages(tx, updated, ["cancellation"], s);
    await audit(actor, "appointment.cancelled", "appointment", id, { start: a.startAt.toISOString() }, tx);
    return updated;
  });
  return appt;
}

export async function rescheduleAppointment(
  id: string,
  newStart: number,
  newLocationId: number,
  actor: Actor,
  opts: { enforcePolicy?: boolean; force?: boolean } = {},
) {
  const s = await getSettings();
  const [current] = await db.select().from(appointments).where(eq(appointments.id, id));
  if (!current) throw new AppError("NOT_FOUND", "No encontramos el turno.", 404);
  if (current.status !== "confirmed") throw new AppError("INVALID_STATE", "Este turno ya no está activo.");
  if (opts.enforcePolicy && hoursUntil(current.startAt) < s.rescheduleLimitHours) {
    throw new AppError(
      "TOO_LATE",
      `Los turnos se pueden reprogramar online hasta ${s.rescheduleLimitHours} horas antes. Escribinos por WhatsApp y lo resolvemos.`,
    );
  }
  const { coverage, type } = await resolveCoverageAndType(current.coverageId, current.consultationTypeId);
  if (!opts.force) {
    const check = await isSlotAvailable({
      coverageId: coverage.id,
      consultationTypeId: type.id,
      start: newStart,
      locationId: newLocationId,
      excludeAppointmentId: id,
      ignoreNotice: actor.type === "admin",
    });
    if (!check.ok) throw new AppError("SLOT_UNAVAILABLE", "Ese horario ya no está disponible. Elegí otro, por favor.", 409);
  }
  const duration = durationFor(coverage, type);
  const start = new Date(newStart);
  const end = new Date(newStart + duration * MIN);
  try {
    // Si algo falla, la transacción se revierte y el turno original queda intacto.
    return await db.transaction(async (tx) => {
      const [a] = await tx.select().from(appointments).where(eq(appointments.id, id)).for("update");
      if (!a || a.status !== "confirmed") throw new AppError("INVALID_STATE", "Este turno ya no está activo.");
      const [updated] = await tx
        .update(appointments)
        .set({
          startAt: start,
          endAt: end,
          blockEndAt: new Date(end.getTime() + s.bufferMinutes * MIN),
          locationId: newLocationId,
          rescheduleCount: a.rescheduleCount + 1,
          attendanceConfirmedAt: null,
          googleSyncStatus: isGoogleConfigured() ? "pending" : "not_connected",
          googleSyncAttempts: 0,
          googleNextAttemptAt: null,
          syncVersion: sql`${appointments.syncVersion} + 1`,
          needsReview: false,
          reviewReason: null,
          updatedAt: new Date(),
        })
        .where(eq(appointments.id, id))
        .returning();
      await cancelPendingMessages(tx, id);
      await enqueueAppointmentMessages(tx, updated, ["reschedule", "reminder_48", "reminder_24"], s);
      await audit(actor, "appointment.rescheduled", "appointment", id, { from: a.startAt.toISOString(), to: start.toISOString() }, tx);
      return { appointment: updated, previous: a };
    });
  } catch (e) {
    if (pgCode(e) === PG_EXCLUSION_VIOLATION) throw slotTakenError();
    throw e;
  }
}

export async function confirmAttendance(id: string, actor: Actor) {
  const [a] = await db
    .update(appointments)
    .set({ attendanceConfirmedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(appointments.id, id), eq(appointments.status, "confirmed")))
    .returning();
  if (!a) throw new AppError("INVALID_STATE", "Este turno ya no está activo.");
  await audit(actor, "appointment.attendance_confirmed", "appointment", id);
  return a;
}

/** Nueva reserva después de cancelar, con los mismos datos de la paciente. */
export async function rebookFromCancelled(old: Appointment, start: number, locationId: number) {
  const [p] = await db.select().from(patients).where(eq(patients.id, old.patientId));
  return bookAppointment({
    coverageId: old.coverageId,
    consultationTypeId: old.consultationTypeId,
    locationId,
    start,
    patient: {
      fullName: old.contactName,
      dni: p.dni,
      phone: old.contactPhone,
      email: old.contactEmail,
      memberNumber: old.memberNumber,
    },
    consentReminders: old.consentReminders,
    privacyAccepted: true,
    verifiedPatientId: null,
    source: "web",
    actor: { type: "patient", id: old.patientId },
  });
}

/** Revoca el enlace actual y genera uno nuevo. */
export async function regenerateManageToken(id: string, actor: Actor) {
  const t = newManageToken();
  await db.update(appointments).set({ manageTokenHash: t.hash, manageTokenEnc: t.enc, updatedAt: new Date() }).where(eq(appointments.id, id));
  await audit(actor, "appointment.link_regenerated", "appointment", id);
  return t.token;
}

export async function setAppointmentStatus(id: string, status: "completed" | "no_show", actor: Actor) {
  await db.update(appointments).set({ status, updatedAt: new Date() }).where(eq(appointments.id, id));
  await audit(actor, `appointment.${status}`, "appointment", id);
}
