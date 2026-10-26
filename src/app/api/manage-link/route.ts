import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { appointments, notifications } from "@/db/schema";
import { handle, clientIp } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { isEmailConfigured, isWhatsAppConfigured } from "@/lib/env";
import { processOutbox } from "@/lib/messaging/outbox";
import { normalizePhone } from "@/lib/phone";
import { rateLimit } from "@/lib/ratelimit";

const body = z.object({ channel: z.enum(["email", "whatsapp"]), value: z.string().min(3).max(120) });

/** Reenvía el enlace de gestión al contacto registrado en el turno (nunca lo muestra en pantalla). */
export async function POST(req: Request) {
  return handle(async () => {
    const { channel, value } = body.parse(await req.json());
    if (channel === "whatsapp" ? !isWhatsAppConfigured() : !isEmailConfigured()) throw new AppError("INVALID_INPUT", "Ese medio no está disponible.");
    const target = channel === "email" ? value.trim().toLowerCase() : normalizePhone(value);
    if (!target) throw new AppError("INVALID_INPUT", "Revisá el número de celular.");
    await rateLimit(`resend:ip:${clientIp(req)}`, 6, 3600);
    await rateLimit(`resend:t:${target}`, 3, 3600);
    const rows = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.status, "confirmed"),
          gt(appointments.startAt, new Date()),
          channel === "email" ? sql`lower(${appointments.contactEmail}) = ${target}` : eq(appointments.contactPhone, target),
        ),
      )
      .limit(3);
    const bucket = Math.floor(Date.now() / 600_000);
    for (const a of rows) {
      await db
        .insert(notifications)
        .values({
          appointmentId: a.id,
          kind: "confirmation",
          channel,
          recipient: target,
          payload: { startAt: String(a.startAt.getTime()) },
          scheduledFor: new Date(),
          dedupeKey: `${a.id}:resend:${bucket}:${channel}`,
        })
        .onConflictDoNothing();
    }
    if (rows.length) await processOutbox(10).catch(() => null);
    return { ok: true };
  });
}
