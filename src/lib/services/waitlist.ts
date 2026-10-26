import { and, asc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import { consultationTypes, coverages, notifications, waitlist } from "@/db/schema";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { channelsFor } from "@/lib/messaging/outbox";
import { randomToken, sha256 } from "@/lib/security";
import { formatDateLong, formatTime, localDateKey } from "@/lib/time";
import { findSlots } from "./availability-service";
import { getSettings, resolveCoverageAndType } from "./config";

export async function joinWaitlist(input: {
  fullName: string;
  phone: string;
  email?: string | null;
  coverageId: number;
  consultationTypeId: number;
  wantsBefore?: number | null;
  timePreference: "any" | "morning" | "afternoon";
  consent: boolean;
}) {
  await resolveCoverageAndType(input.coverageId, input.consultationTypeId);
  const token = randomToken(24);
  const [row] = await db
    .insert(waitlist)
    .values({
      fullName: input.fullName,
      phone: input.phone,
      email: input.email || null,
      coverageId: input.coverageId,
      consultationTypeId: input.consultationTypeId,
      wantsBefore: input.wantsBefore ? new Date(input.wantsBefore) : null,
      timePreference: input.timePreference,
      consent: input.consent,
      removeTokenHash: sha256(token),
    })
    .returning({ id: waitlist.id });
  await audit({ type: "patient" }, "waitlist.joined", "waitlist", row.id);
  return { id: row.id, removeToken: token };
}

export async function leaveWaitlist(token: string) {
  const rows = await db
    .update(waitlist)
    .set({ status: "removed" })
    .where(eq(waitlist.removeTokenHash, sha256(token)))
    .returning({ id: waitlist.id });
  return rows.length > 0;
}

const MAX_OFFERS_PER_SLOT = 3;

/**
 * Se liberó un horario: avisa a las primeras pacientes compatibles de la lista de espera.
 * No reserva nada: el turno queda para quien lo confirme primero (la base impide duplicados).
 */
export async function offerFreedSlot(freedStart: Date, freedEnd: Date) {
  const s = await getSettings();
  if (!s.waitlistEnabled || freedStart.getTime() < Date.now()) return { offered: 0 };
  const entries = await db
    .select()
    .from(waitlist)
    .where(
      and(
        inArray(waitlist.status, ["active", "notified"]),
        eq(waitlist.consent, true),
        or(isNull(waitlist.wantsBefore), gte(waitlist.wantsBefore, freedStart)),
        or(isNull(waitlist.lastNotifiedAt), lt(waitlist.lastNotifiedAt, sql`now() - interval '12 hours'`)),
      ),
    )
    .orderBy(asc(waitlist.createdAt))
    .limit(50);
  if (!entries.length) return { offered: 0 };

  const day = DateTime.fromMillis(freedStart.getTime(), { zone: s.timezone }).startOf("day");
  const slotCache = new Map<string, number | null>();
  let offered = 0;
  for (const e of entries) {
    if (offered >= MAX_OFFERS_PER_SLOT) break;
    const key = `${e.coverageId}:${e.consultationTypeId}`;
    if (!slotCache.has(key)) {
      try {
        const r = await findSlots({ coverageId: e.coverageId, consultationTypeId: e.consultationTypeId, from: day.toMillis(), to: day.plus({ days: 1 }).toMillis() });
        const match = r.slots.find((x) => x.start >= freedStart.getTime() && x.start < freedEnd.getTime());
        slotCache.set(key, match?.start ?? null);
      } catch {
        slotCache.set(key, null);
      }
    }
    const start = slotCache.get(key);
    if (!start) continue;
    const hour = DateTime.fromMillis(start, { zone: s.timezone }).hour;
    if ((e.timePreference === "morning" && hour >= 13) || (e.timePreference === "afternoon" && hour < 13)) continue;

    const [cov] = await db.select().from(coverages).where(eq(coverages.id, e.coverageId));
    const [type] = await db.select().from(consultationTypes).where(eq(consultationTypes.id, e.consultationTypeId));
    const link = `${env.appUrl()}/reservar?cobertura=${cov.slug}&tipo=${type.slug}&fecha=${localDateKey(start, s.timezone)}`;
    const payload = {
      nombre: e.fullName.split(" ")[0],
      profesional: s.professionalName,
      fecha: formatDateLong(start, s.timezone),
      hora: formatTime(start, s.timezone),
      link,
    };
    const rows = channelsFor("waitlist_offer", { phone: e.phone, email: e.email }).map((channel) => ({
      waitlistId: e.id,
      kind: "waitlist_offer",
      channel,
      recipient: channel === "whatsapp" ? e.phone : e.email!,
      payload,
      scheduledFor: new Date(),
      dedupeKey: `wl:${e.id}:${start}:${channel}`,
    }));
    if (!rows.length) continue;
    await db.insert(notifications).values(rows).onConflictDoNothing();
    await db
      .update(waitlist)
      .set({ status: "notified", lastNotifiedAt: new Date(), notifyCount: sql`${waitlist.notifyCount} + 1` })
      .where(eq(waitlist.id, e.id));
    offered++;
  }
  return { offered };
}
