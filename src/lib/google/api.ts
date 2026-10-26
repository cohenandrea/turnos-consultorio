/**
 * Cliente mínimo de Google OAuth + Calendar API v3 usando fetch (sin SDK pesado).
 * Documentación: https://developers.google.com/calendar/api/v3/reference
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleIntegration } from "@/db/schema";
import { env, isGoogleConfigured } from "@/lib/env";
import { decrypt, encrypt } from "@/lib/security";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const redirectUri = () => `${env.appUrl()}/api/google/callback`;

export function buildAuthUrl(state: string) {
  const p = new URLSearchParams({
    client_id: env.google().clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${p}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.google().clientId, client_secret: env.google().clientSecret, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleApiError(res.status, `OAuth: ${json.error_description ?? json.error ?? res.statusText}`);
  return json as { access_token: string; expires_in: number; refresh_token?: string; id_token?: string };
}

export async function exchangeCode(code: string) {
  const tok = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  let email: string | null = null;
  if (tok.id_token) {
    try {
      email = JSON.parse(Buffer.from(tok.id_token.split(".")[1], "base64url").toString()).email ?? null;
    } catch {}
  }
  return { ...tok, email };
}

export async function getIntegration() {
  const [row] = await db.select().from(googleIntegration).where(eq(googleIntegration.id, 1));
  return row ?? null;
}

/** ¿Hay una cuenta conectada y un calendario elegido? */
export async function isGoogleReady() {
  if (!isGoogleConfigured()) return false;
  const g = await getIntegration();
  return Boolean(g?.refreshTokenEnc && g.calendarId);
}

let memToken: { token: string; exp: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (memToken && memToken.exp > Date.now() + 60_000) return memToken.token;
  const g = await getIntegration();
  if (!g?.refreshTokenEnc) throw new GoogleApiError(401, "Google Calendar no está conectado");
  if (g.accessTokenEnc && g.accessTokenExpiresAt && g.accessTokenExpiresAt.getTime() > Date.now() + 60_000) {
    memToken = { token: decrypt(g.accessTokenEnc), exp: g.accessTokenExpiresAt.getTime() };
    return memToken.token;
  }
  const tok = await tokenRequest({ refresh_token: decrypt(g.refreshTokenEnc), grant_type: "refresh_token" });
  const exp = Date.now() + tok.expires_in * 1000;
  await db
    .update(googleIntegration)
    .set({ accessTokenEnc: encrypt(tok.access_token), accessTokenExpiresAt: new Date(exp) })
    .where(eq(googleIntegration.id, 1));
  memToken = { token: tok.access_token, exp };
  return tok.access_token;
}

export function resetTokenCache() {
  memToken = null;
}

async function call<T>(method: string, path: string, opts: { query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  const token = await getAccessToken();
  const url = `${API}${path}${opts.query ? "?" + new URLSearchParams(opts.query) : ""}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(opts.body ? { "Content-Type": "application/json" } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleApiError(res.status, `Google Calendar ${res.status}: ${json?.error?.message ?? res.statusText}`);
  return json as T;
}

export type GEvent = {
  id: string;
  status?: string; // confirmed | tentative | cancelled
  summary?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
  updated?: string;
};

export const listCalendars = () =>
  call<{ items: { id: string; summary: string; primary?: boolean; accessRole: string }[] }>("GET", "/users/me/calendarList", {
    query: { minAccessRole: "reader" },
  }).then((r) => r.items ?? []);

export async function listEvents(calendarId: string, query: Record<string, string>) {
  const items: GEvent[] = [];
  let pageToken: string | undefined;
  do {
    const r = await call<{ items: GEvent[]; nextPageToken?: string }>("GET", `/calendars/${encodeURIComponent(calendarId)}/events`, {
      query: { singleEvents: "true", maxResults: "2500", ...query, ...(pageToken ? { pageToken } : {}) },
    });
    items.push(...(r.items ?? []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return items;
}

export const freeBusy = (calendarIds: string[], timeMin: string, timeMax: string) =>
  call<{ calendars: Record<string, { busy: { start: string; end: string }[]; errors?: unknown[] }> }>("POST", "/freeBusy", {
    body: { timeMin, timeMax, items: calendarIds.map((id) => ({ id })) },
  });

export const insertEvent = (calendarId: string, body: unknown) =>
  call<GEvent>("POST", `/calendars/${encodeURIComponent(calendarId)}/events`, { body });

export const patchEvent = (calendarId: string, eventId: string, body: unknown) =>
  call<GEvent>("PATCH", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { body });

export const deleteEvent = (calendarId: string, eventId: string) =>
  call<void>("DELETE", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
