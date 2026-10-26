import { asc } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/services/config";
import { formatShort } from "@/lib/time";
import { Badge, F, Flash, PageHeader, Section, SubmitButton, td, th } from "@/components/admin";
import { addUser, changePassword, toggleUser } from "../../actions/config";

export default async function Usuarios({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireAdmin("owner");
  const sp = await searchParams;
  const [s, users] = await Promise.all([getSettings(), db.select().from(adminUsers).orderBy(asc(adminUsers.createdAt))]);
  return (
    <>
      <PageHeader title="Usuarios" subtitle="“Profesional” accede a todo. “Secretaría” gestiona turnos, pacientes, bloqueos y lista de espera." />
      <Flash sp={sp} />
      <Section title="Usuarios con acceso">
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[520px]">
            <thead className="border-b border-line"><tr><th className={th}>Usuario</th><th className={th}>Rol</th><th className={th}>Último ingreso</th><th className={th}></th></tr></thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className={td}><span className="font-semibold">{u.name}</span><div className="text-xs text-muted">{u.email}</div></td>
                  <td className={td}>{u.role === "owner" ? "Profesional" : "Secretaría"}</td>
                  <td className={td}>{u.lastLoginAt ? formatShort(u.lastLoginAt, s.timezone) : "—"}</td>
                  <td className={td}>
                    {u.id !== me.id ? (
                      <form action={toggleUser}><input type="hidden" name="id" value={u.id} /><SubmitButton className="text-sm font-semibold text-brand">{u.active ? "Desactivar" : "Activar"}</SubmitButton></form>
                    ) : <Badge status="active" label="Vos" />}
                    {!u.active && <Badge status="removed" label="Inactivo" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Agregar usuario">
          <form action={addUser} className="grid gap-3">
            <F label="Nombre"><input className="input" name="name" required /></F>
            <F label="Correo"><input className="input" type="email" name="email" required /></F>
            <F label="Contraseña inicial" hint="Mínimo 10 caracteres."><input className="input" type="password" name="password" minLength={10} required /></F>
            <F label="Rol">
              <select className="input" name="role"><option value="secretary">Secretaría</option><option value="owner">Profesional (acceso total)</option></select>
            </F>
            <SubmitButton>Crear usuario</SubmitButton>
          </form>
        </Section>
        <Section title="Cambiar mi contraseña">
          <form action={changePassword} className="grid gap-3">
            <F label="Contraseña actual"><input className="input" type="password" name="current" required autoComplete="current-password" /></F>
            <F label="Nueva contraseña" hint="Mínimo 10 caracteres. Cierra las demás sesiones."><input className="input" type="password" name="next" minLength={10} required autoComplete="new-password" /></F>
            <SubmitButton>Cambiar contraseña</SubmitButton>
          </form>
        </Section>
      </div>
    </>
  );
}
