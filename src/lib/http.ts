import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";
import { firstZodMessage } from "./validation";

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Convierte errores conocidos en respuestas JSON claras (sin filtrar detalles internos). */
export async function handle(fn: () => Promise<unknown>) {
  try {
    const data = await fn();
    return data instanceof Response ? data : NextResponse.json(data ?? { ok: true });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    if (e instanceof ZodError) return NextResponse.json({ error: firstZodMessage(e), code: "INVALID_INPUT" }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Ocurrió un error inesperado. Probá de nuevo en unos minutos.", code: "INTERNAL" }, { status: 500 });
  }
}
