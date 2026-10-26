import Link from "next/link";
import { redirect } from "next/navigation";
import { clearSession, requireAdmin } from "@/lib/auth";
import { brandStyle } from "@/lib/color";
import { getSettings } from "@/lib/services/config";
import { AdminNav } from "./AdminNav";

export const dynamic = "force-dynamic";

async function logout() {
  "use server";
  await clearSession();
  redirect("/admin/login");
}

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const s = await getSettings();
  const owner = admin.role === "owner";
  const items = [
    ["/admin", "Inicio"],
    ["/admin/turnos", "Turnos"],
    ["/admin/pacientes", "Pacientes"],
    ["/admin/bloqueos", "Bloqueos y feriados"],
    ["/admin/lista-espera", "Lista de espera"],
    ...(owner
      ? [
          ["/admin/agenda", "Horarios y agenda"],
          ["/admin/coberturas", "Coberturas"],
          ["/admin/mensajes", "Mensajes"],
          ["/admin/compartir", "Enlaces y QR"],
          ["/admin/integraciones", "Integraciones"],
          ["/admin/configuracion", "Configuración"],
          ["/admin/usuarios", "Usuarios"],
          ["/admin/auditoria", "Registro de cambios"],
        ]
      : []),
  ] as [string, string][];
  return (
    <div style={brandStyle(s.primaryColor, s.accentColor)} className="min-h-dvh lg:flex">
      <aside className="border-b border-line bg-white lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-4 py-4 lg:block">
          <Link href="/admin" className="block">
            <p className="text-lg leading-tight font-extrabold text-accent">{s.professionalName}</p>
            <p className="text-xs text-muted">Panel del consultorio</p>
          </Link>
        </div>
        <AdminNav items={items} />
        <div className="hidden px-4 py-4 text-sm text-muted lg:block">
          <p className="truncate">{admin.email}</p>
          <div className="mt-2 flex gap-3">
            <Link href="/" target="_blank" className="underline">
              Ver sitio
            </Link>
            <form action={logout}>
              <button className="underline">Salir</button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
        <form action={logout} className="mt-10 text-center lg:hidden">
          <button className="text-sm text-muted underline">Cerrar sesión</button>
        </form>
      </main>
    </div>
  );
}
