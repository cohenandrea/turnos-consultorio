import { sql } from "drizzle-orm";
import { db } from "@/db";
import { AppError } from "./errors";

/** Límite de solicitudes por ventana fija, almacenado en Postgres (funciona en serverless). */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const rows = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, count, window_start) VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE rate_limits.window_start END
    RETURNING count`);
  if (Number(rows[0]?.count ?? 0) > limit) {
    throw new AppError("RATE_LIMITED", "Hiciste demasiados intentos. Esperá unos minutos y volvé a probar.", 429);
  }
}
