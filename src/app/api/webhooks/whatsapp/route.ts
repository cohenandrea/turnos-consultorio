import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { env } from "@/lib/env";
import { verifyWebhookSignature } from "@/lib/messaging/whatsapp";

/** Verificación inicial del webhook (Meta envía hub.challenge). */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const verify = env.whatsapp().verifyToken;
  if (p.get("hub.mode") === "subscribe" && verify && p.get("hub.verify_token") === verify) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };

/** Estados de entrega: sent → delivered → read, o failed. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("Invalid signature", { status: 401 });
  const body = JSON.parse(raw);
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const st of change.value?.statuses ?? []) {
        const [n] = await db.select().from(notifications).where(eq(notifications.providerMessageId, st.id));
        if (!n || (RANK[st.status] ?? 0) <= (RANK[n.status] ?? 0)) continue;
        await db
          .update(notifications)
          .set({
            status: st.status,
            lastError: st.status === "failed" ? `${st.errors?.[0]?.title ?? "Error"} (${st.errors?.[0]?.code ?? "?"})` : n.lastError,
            updatedAt: new Date(),
          })
          .where(eq(notifications.id, n.id));
      }
    }
  }
  return NextResponse.json({ ok: true });
}
