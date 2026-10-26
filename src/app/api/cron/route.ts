import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/security";
import { runScheduledJobs } from "@/lib/services/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Llamar cada 5–10 minutos con el encabezado "Authorization: Bearer CRON_SECRET" (o ?secret=). */
async function run(req: Request) {
  const secret = env.cronSecret();
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? new URL(req.url).searchParams.get("secret") ?? "";
  if (!secret || !safeEqual(auth, secret)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const result = await runScheduledJobs();
  return NextResponse.json({ ok: true, at: new Date().toISOString(), result });
}

export const GET = run;
export const POST = run;
