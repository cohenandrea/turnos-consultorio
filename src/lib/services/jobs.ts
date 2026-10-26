import { sql } from "drizzle-orm";
import { db } from "@/db";
import { pullExternalChanges, reconcilePending, syncAppointment } from "@/lib/google/sync";
import { processOutbox } from "@/lib/messaging/outbox";
import { cancelAppointment } from "./booking";
import { cleanupOtps } from "./otp";
import { offerFreedSlot } from "./waitlist";

function logErr(where: string) {
  return (e: unknown) => {
    console.error(`[jobs] ${where}:`, (e as Error).message);
    return null;
  };
}

/**
 * Trabajo inmediato después de un cambio (se ejecuta tras responder a la paciente).
 * Si falla, el proceso programado (cron) lo reintenta: nada depende de que la página siga abierta.
 */
export async function afterAppointmentChange(appointmentId: string, freed?: { start: Date; end: Date }) {
  await syncAppointment(appointmentId).catch(logErr("google"));
  if (freed) await offerFreedSlot(freed.start, freed.end).catch(logErr("waitlist"));
  await processOutbox(20).catch(logErr("outbox"));
}

/** Tarea programada (cada 5–10 minutos). */
export async function runScheduledJobs() {
  const out: Record<string, unknown> = {};
  out.outbox = await processOutbox(100).catch(logErr("outbox"));
  out.googlePush = await reconcilePending(50).catch(logErr("google-push"));
  out.googlePull = await pullExternalChanges(async (id) => {
    const appt = await cancelAppointment(id, { type: "google" }, { notify: true });
    await offerFreedSlot(appt.startAt, appt.endAt).catch(logErr("waitlist"));
  }).catch(logErr("google-pull"));
  // Mensajes generados en esta misma pasada (p. ej. cancelaciones desde Google)
  out.outbox2 = await processOutbox(50).catch(logErr("outbox"));
  await cleanupOtps().catch(logErr("otp-cleanup"));
  await db.execute(sql`UPDATE settings SET last_cron_at = now() WHERE id = 1`).catch(logErr("cron-mark"));
  await db.execute(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`).catch(logErr("rl-cleanup"));
  return out;
}
