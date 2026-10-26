/**
 * Bandeja de salida: los mensajes se guardan en la base (en la misma transacción que el turno)
 * y un proceso programado los envía con reintentos. `dedupe_key` garantiza que no se dupliquen.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { appointments, locations, messageTemplates, notifications, type Appointment, type Notification, type Settings } from "@/db/schema";
import { reminderSendTime } from "@/lib/availability";
import { env, isEmailConfigured, isWhatsAppConfigured } from "@/lib/env";
import { decrypt } from "@/lib/security";
import { formatDateLong, formatTime } from "@/lib/time";
import { getSettings } from "@/lib/services/config";
import { sendEmail } from "./email";
import { placeholderOrder, renderTemplate, type TemplateVars } from "./templates";
import { sendWhatsAppTemplate } from "./whatsapp";

export type NotifKind = "confirmation" | "reminder_48" | "reminder_24" | "reschedule" | "cancellation" | "waitlist_offer";
export type Channel = "whatsapp" | "email";

const REMINDERS: NotifKind[] = ["reminder_48", "reminder_24"];
const MAX_ATTEMPTS = 5;

/** WhatsApp como canal principal; email como alternativa (y copia de la confirmación). */
export function channelsFor(kind: NotifKind, contact: { phone?: string | null; email?: string | null }): Channel[] {
  const out: Channel[] = [];
  if (isWhatsAppConfigured() && contact.phone) out.push("whatsapp");
  if (isEmailConfigured() && contact.email && (out.length === 0 || kind === "confirmation" || kind === "reschedule")) out.push("email");
  return out;
}

export async function enqueueAppointmentMessages(tx: Tx, appt: Appointment, kinds: NotifKind[], s: Settings, now = Date.now()) {
  const rows: (typeof notifications.$inferInsert)[] = [];
  for (const kind of kinds) {
    let when: number | null = now;
    if (kind === "reminder_48" || kind === "reminder_24") {
      const enabled = kind === "reminder_48" ? s.reminder48Enabled : s.reminder24Enabled;
      if (!enabled || !appt.consentReminders) continue;
      when = reminderSendTime(appt.startAt.getTime(), kind === "reminder_48" ? 48 : 24, now, s.timezone, s.reminderWindowStart, s.reminderWindowEnd);
      if (when === null) continue;
    }
    for (const channel of channelsFor(kind, { phone: appt.contactPhone, email: appt.contactEmail })) {
      rows.push({
        appointmentId: appt.id,
        kind,
        channel,
        recipient: channel === "whatsapp" ? appt.contactPhone : appt.contactEmail!,
        payload: { startAt: String(appt.startAt.getTime()) },
        scheduledFor: new Date(when),
        dedupeKey: `${appt.id}:${kind}:${appt.startAt.getTime()}:${channel}`,
      });
    }
  }
  if (rows.length) await tx.insert(notifications).values(rows).onConflictDoNothing();
  return rows.length;
}

/** Cancela mensajes pendientes de un turno (todos, o solo recordatorios). */
export async function cancelPendingMessages(tx: Tx, appointmentId: string, onlyReminders = false) {
  await tx
    .update(notifications)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(notifications.appointmentId, appointmentId),
        eq(notifications.status, "pending"),
        onlyReminders ? inArray(notifications.kind, REMINDERS) : undefined,
      ),
    );
}

export function manageLink(appt: Pick<Appointment, "manageTokenEnc">) {
  return `${env.appUrl()}/t/${decrypt(appt.manageTokenEnc)}`;
}

type Outcome = { status: "sent"; providerId: string } | { status: "skipped" | "cancelled"; reason: string };

async function deliver(n: Notification, s: Settings): Promise<Outcome> {
  const [tpl] = await db.select().from(messageTemplates).where(eq(messageTemplates.key, n.kind));
  if (!tpl || !tpl.enabled) return { status: "skipped", reason: "Plantilla deshabilitada" };

  let vars: TemplateVars;
  if (n.appointmentId) {
    const [appt] = await db.select().from(appointments).where(eq(appointments.id, n.appointmentId));
    if (!appt) return { status: "cancelled", reason: "Turno inexistente" };
    const sameTime = n.payload?.startAt === String(appt.startAt.getTime());
    if (n.kind !== "cancellation") {
      if (appt.status !== "confirmed") return { status: "cancelled", reason: "El turno ya no está confirmado" };
      if (!sameTime) return { status: "cancelled", reason: "El turno cambió de horario" };
      if (appt.startAt.getTime() <= Date.now()) return { status: "skipped", reason: "El turno ya pasó" };
    }
    const [loc] = await db.select().from(locations).where(eq(locations.id, appt.locationId));
    const start = Number(n.payload?.startAt ?? appt.startAt.getTime());
    vars = {
      nombre: appt.contactName.split(" ")[0],
      profesional: s.professionalName,
      fecha: formatDateLong(start, s.timezone),
      hora: formatTime(start, s.timezone),
      direccion: loc?.address ?? "",
      link: n.kind === "cancellation" ? `${env.appUrl()}/reservar` : manageLink(appt),
    };
  } else {
    vars = (n.payload ?? {}) as TemplateVars;
  }

  if (n.channel === "whatsapp") {
    if (!tpl.whatsappTemplateName) return { status: "skipped", reason: "Falta el nombre de la plantilla de WhatsApp" };
    const params = placeholderOrder(tpl.body).map((k) => (vars as Record<string, string>)[k] ?? "");
    const r = await sendWhatsAppTemplate({ to: n.recipient, templateName: tpl.whatsappTemplateName, language: tpl.whatsappLanguage, bodyParams: params });
    return { status: "sent", providerId: r.id };
  }
  const r = await sendEmail({
    to: n.recipient,
    subject: tpl.emailSubject,
    text: renderTemplate(tpl.body, vars),
    brandName: s.professionalName,
    color: s.primaryColor,
  });
  return { status: "sent", providerId: r.id };
}

/** Envía los mensajes vencidos. Seguro para ejecutar en paralelo (FOR UPDATE SKIP LOCKED). */
export async function processOutbox(limit = 50) {
  // Mensajes que quedaron "enviándose" por un corte inesperado vuelven a la cola
  await db.execute(sql`UPDATE notifications SET status = 'pending', updated_at = now()
    WHERE status = 'sending' AND updated_at < now() - interval '10 minutes'`);
  const claimed = await db.execute<{ id: string }>(sql`
    UPDATE notifications SET status = 'sending', attempts = attempts + 1, updated_at = now()
    WHERE id IN (
      SELECT id FROM notifications
      WHERE status = 'pending' AND scheduled_for <= now() AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY scheduled_for LIMIT ${limit}
      FOR UPDATE SKIP LOCKED)
    RETURNING id`);
  if (claimed.length === 0) return { sent: 0, failed: 0, skipped: 0 };
  const s = await getSettings();
  const ids = claimed.map((r) => r.id);
  const rows = await db.select().from(notifications).where(inArray(notifications.id, ids));
  const result = { sent: 0, failed: 0, skipped: 0 };
  for (const n of rows) {
    try {
      const out = await deliver(n, s);
      if (out.status === "sent") {
        result.sent++;
        await db
          .update(notifications)
          .set({ status: "sent", sentAt: new Date(), providerMessageId: out.providerId, lastError: null, updatedAt: new Date() })
          .where(eq(notifications.id, n.id));
      } else {
        result.skipped++;
        await db.update(notifications).set({ status: out.status, lastError: out.reason, updatedAt: new Date() }).where(eq(notifications.id, n.id));
      }
    } catch (e) {
      const final = n.attempts >= MAX_ATTEMPTS;
      if (final) result.failed++;
      await db
        .update(notifications)
        .set({
          status: final ? "failed" : "pending",
          lastError: (e as Error).message.slice(0, 500),
          nextAttemptAt: new Date(Date.now() + 2 ** n.attempts * 60_000),
          updatedAt: new Date(),
        })
        .where(eq(notifications.id, n.id));
    }
  }
  return result;
}
