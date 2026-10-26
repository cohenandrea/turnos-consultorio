export type AppErrorCode =
  | "SLOT_UNAVAILABLE"
  | "SLOT_TAKEN"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "TOO_LATE"
  | "ALREADY_HAS_APPOINTMENT"
  | "NOT_ALLOWED"
  | "RATE_LIMITED"
  | "INVALID_STATE";

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Código de error de Postgres (postgres.js o envuelto por Drizzle). */
export function pgCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    const c = (cur as { code?: unknown }).code;
    if (typeof c === "string" && /^[0-9A-Z]{5}$/.test(c)) return c;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

export const PG_EXCLUSION_VIOLATION = "23P01";
export const PG_UNIQUE_VIOLATION = "23505";
