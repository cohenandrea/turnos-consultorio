import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { audit } from "./audit";
import { env } from "./env";
import { rateLimit } from "./ratelimit";

export const SESSION_COOKIE = "admin_session";
const SESSION_HOURS = 12;

export type AdminSession = { id: string; email: string; name: string; role: "owner" | "secretary" };

const key = () => new TextEncoder().encode(env.sessionSecret());

export async function verifySessionToken(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.purpose !== "admin") return null;
    return payload as { sub: string; v: number };
  } catch {
    return null;
  }
}

/**
 * Inicio de sesión. Si todavía no existe ningún usuario, se crea la cuenta "owner"
 * con ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD (variables de entorno).
 */
export async function login(email: string, password: string, ip: string): Promise<string | null> {
  await rateLimit(`login:ip:${ip}`, 10, 900);
  await rateLimit(`login:u:${email.toLowerCase()}`, 8, 900);
  const normalized = email.trim().toLowerCase();
  const [{ n }] = await db.select({ n: count() }).from(adminUsers);
  if (n === 0) {
    const bootEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const bootPass = process.env.ADMIN_INITIAL_PASSWORD;
    if (bootEmail && bootPass && bootPass.length >= 10 && normalized === bootEmail && password === bootPass) {
      await db.insert(adminUsers).values({ email: bootEmail, name: "Administración", passwordHash: await bcrypt.hash(password, 12), role: "owner" }).onConflictDoNothing();
    }
  }
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, normalized));
  const valid = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!valid) {
    await audit({ type: "system" }, "admin.login_failed", "admin_user", null, { email: normalized });
    return null;
  }
  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, user.id));
  await audit({ type: "admin", id: user.id }, "admin.login", "admin_user", user.id);
  return new SignJWT({ purpose: "admin", v: user.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(key());
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getAdmin(): Promise<AdminSession | null> {
  const payload = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, payload.sub));
  if (!user || !user.active || user.sessionVersion !== payload.v) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role as AdminSession["role"] };
}

/** Verificación en cada página y acción del panel (no alcanza con el middleware). */
export async function requireAdmin(role?: "owner"): Promise<AdminSession> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  if (role === "owner" && admin.role !== "owner") redirect("/admin?error=" + encodeURIComponent("No tenés permiso para esa sección."));
  return admin;
}

export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const checkPassword = (p: string, h: string) => bcrypt.compare(p, h);
