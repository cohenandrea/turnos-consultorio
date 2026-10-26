import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, and, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import { appointments, googleIntegration } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { exchangeCode, resetTokenCache } from "@/lib/google/api";
import { encrypt, safeEqual } from "@/lib/security";

export async function GET(req: Request) {
  const admin = await requireAdmin("owner");
  const url = new URL(req.url);
  const back = (msg: string, kind: "ok" | "error") => NextResponse.redirect(`${env.appUrl()}/admin/integraciones?${kind}=${encodeURIComponent(msg)}`);
  const jar = await cookies();
  const expected = jar.get("g_oauth_state")?.value ?? "";
  jar.delete("g_oauth_state");
  if (url.searchParams.get("error")) return back("Google no autorizó la conexión.", "error");
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  if (!code || !expected || !safeEqual(state, expected)) return back("La solicitud de conexión no es válida. Probá de nuevo.", "error");
  try {
    const tok = await exchangeCode(code);
    if (!tok.refresh_token) return back("Google no entregó un permiso permanente. Quitá el acceso de la app en tu cuenta de Google y volvé a conectar.", "error");
    await db
      .update(googleIntegration)
      .set({
        accountEmail: tok.email,
        refreshTokenEnc: encrypt(tok.refresh_token),
        accessTokenEnc: encrypt(tok.access_token),
        accessTokenExpiresAt: new Date(Date.now() + tok.expires_in * 1000),
        connectedAt: new Date(),
        lastError: null,
      })
      .where(eq(googleIntegration.id, 1));
    resetTokenCache();
    // Los turnos futuros que se crearon sin conexión se sincronizan en la próxima pasada
    await db
      .update(appointments)
      .set({ googleSyncStatus: "pending", googleSyncAttempts: 0, googleNextAttemptAt: null })
      .where(and(eq(appointments.status, "confirmed"), gt(appointments.startAt, new Date()), inArray(appointments.googleSyncStatus, ["not_connected", "error"])));
    await audit({ type: "admin", id: admin.id }, "google.connected", "integration", "google");
    return back("Cuenta de Google conectada. Ahora elegí el calendario.", "ok");
  } catch (e) {
    return back(`No se pudo conectar: ${(e as Error).message}`, "error");
  }
}
