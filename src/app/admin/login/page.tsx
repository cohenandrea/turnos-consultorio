import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAdmin, login, setSessionCookie } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ingresar", robots: { index: false } };

async function loginAction(formData: FormData) {
  "use server";
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  let token: string | null;
  try {
    token = await login(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""), ip);
  } catch (e) {
    if (e instanceof AppError) redirect("/admin/login?error=" + encodeURIComponent(e.message));
    throw e;
  }
  if (!token) redirect("/admin/login?error=" + encodeURIComponent("Correo o contraseña incorrectos."));
  await setSessionCookie(token);
  redirect("/admin");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getAdmin()) redirect("/admin");
  const { error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form action={loginAction} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Panel del consultorio</h1>
          <p className="text-sm text-muted">Acceso exclusivo para la profesional y su equipo.</p>
        </div>
        {error && <p className="alert-error">{error}</p>}
        <label className="block">
          <span className="label">Correo electrónico</span>
          <input className="input" type="email" name="email" autoComplete="username" required />
        </label>
        <label className="block">
          <span className="label">Contraseña</span>
          <input className="input" type="password" name="password" autoComplete="current-password" required />
        </label>
        <SubmitButton className="btn-primary w-full">Ingresar</SubmitButton>
      </form>
    </main>
  );
}
