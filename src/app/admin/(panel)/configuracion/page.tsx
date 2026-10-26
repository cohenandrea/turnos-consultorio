import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/services/config";
import { F, Flash, PageHeader, Section, SubmitButton, Toggle } from "@/components/admin";
import { saveProfile } from "../../actions/config";

export default async function Configuracion({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin("owner");
  const sp = await searchParams;
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Configuración" subtitle="Lo que ven las pacientes en la página de turnos." />
      <Flash sp={sp} />
      <form action={saveProfile}>
        <Section title="Profesional">
          <div className="grid gap-4 md:grid-cols-2">
            <F label="Nombre"><input className="input" name="professionalName" defaultValue={s.professionalName} required /></F>
            <F label="Especialidad"><input className="input" name="specialty" defaultValue={s.specialty} /></F>
            <F label="Presentación breve" className="md:col-span-2"><textarea className="input min-h-20" name="bio" defaultValue={s.bio ?? ""} /></F>
            <F label="Foto (enlace https, opcional)"><input className="input" name="photoUrl" defaultValue={s.photoUrl ?? ""} placeholder="https://…" /></F>
            <F label="WhatsApp para consultas" hint="Se muestra como botón de ayuda."><input className="input" name="whatsappContact" defaultValue={s.whatsappContact ?? ""} placeholder="11 2345-6789" /></F>
            <F label="Correo de contacto"><input className="input" type="email" name="contactEmail" defaultValue={s.contactEmail ?? ""} /></F>
            <F label="Información de atención" hint="Ej.: “Llegá 10 minutos antes con tu credencial”"><textarea className="input min-h-16" name="attentionInfo" defaultValue={s.attentionInfo ?? ""} /></F>
          </div>
        </Section>
        <Section title="Colores">
          <div className="flex flex-wrap gap-6">
            <F label="Color principal"><input className="h-12 w-24 rounded-xl border border-line" type="color" name="primaryColor" defaultValue={s.primaryColor} /></F>
            <F label="Color de acento"><input className="h-12 w-24 rounded-xl border border-line" type="color" name="accentColor" defaultValue={s.accentColor} /></F>
          </div>
          <p className="mt-2 text-sm text-muted">El texto de los botones se ajusta solo para mantener buen contraste.</p>
        </Section>
        <Section title="Lista de espera">
          <Toggle name="waitlistEnabled" defaultChecked={s.waitlistEnabled} label="Permitir que las pacientes se anoten para recibir avisos de turnos liberados" />
        </Section>
        <Section title="Privacidad (Ley 25.326)">
          <div className="grid gap-4">
            <F label="Responsable de la base de datos" hint="Nombre o razón social que figura en la política de privacidad."><input className="input" name="dataControllerName" defaultValue={s.dataControllerName ?? ""} /></F>
            <F label="Texto adicional para la política de privacidad"><textarea className="input min-h-20" name="privacyExtra" defaultValue={s.privacyExtra ?? ""} /></F>
          </div>
        </Section>
        <SubmitButton>Guardar configuración</SubmitButton>
      </form>
    </>
  );
}
