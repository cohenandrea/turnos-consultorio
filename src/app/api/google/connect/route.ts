import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { buildAuthUrl } from "@/lib/google/api";
import { env, isGoogleConfigured } from "@/lib/env";
import { randomToken } from "@/lib/security";

export async function GET() {
  await requireAdmin("owner");
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/admin/integraciones?error=" + encodeURIComponent("Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET."), env.appUrl()));
  }
  const state = randomToken(24);
  (await cookies()).set("g_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });
  return NextResponse.redirect(buildAuthUrl(state));
}
