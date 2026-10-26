import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { AppError } from "./errors";
import { firstZodMessage } from "./validation";

function withParam(path: string, key: string, value: string) {
  const [base, qs] = path.split("?");
  const p = new URLSearchParams(qs);
  p.delete("ok");
  p.delete("error");
  p.set(key, value);
  return `${base}?${p}`;
}

/** Ejecuta una acción del panel y vuelve a la página con un mensaje de éxito o error. */
export async function runAction(back: string, fn: () => Promise<string | void | { redirect: string; message?: string }>): Promise<never> {
  let result: Awaited<ReturnType<typeof fn>>;
  try {
    result = await fn();
  } catch (e) {
    if (e instanceof AppError) redirect(withParam(back, "error", e.message));
    if (e instanceof ZodError) redirect(withParam(back, "error", firstZodMessage(e)));
    throw e;
  }
  if (result && typeof result === "object") redirect(withParam(result.redirect, "ok", result.message ?? "Listo"));
  redirect(withParam(back, "ok", result || "Cambios guardados"));
}

export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const num = (f: FormData, k: string) => Number(f.get(k));
export const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
export const ids = (f: FormData, k: string) => f.getAll(k).map(Number).filter((n) => Number.isFinite(n) && n > 0);
