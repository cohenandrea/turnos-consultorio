import type { Metadata } from "next";
import { PublicShell } from "@/components/PublicShell";
import { getPublicConfig, getSettings } from "@/lib/services/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Política de privacidad" };

export default async function Privacidad() {
  const [config, s] = await Promise.all([getPublicConfig(), getSettings()]);
  const responsable = s.dataControllerName || s.professionalName;
  return (
    <PublicShell config={config}>
      <article className="space-y-4 text-[16px] leading-relaxed [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold">
        <h1 className="font-display text-[28px] font-semibold">Política de privacidad</h1>
        <p>
          Esta política explica cómo se tratan los datos personales que ingresás al reservar un turno, conforme a la Ley N° 25.326 de
          Protección de los Datos Personales y al deber de confidencialidad profesional.
        </p>
        <h2>Responsable</h2>
        <p>
          El responsable de la base de datos es {responsable}
          {s.contactEmail ? <> (contacto: {s.contactEmail})</> : null}.
        </p>
        <h2>Qué datos pedimos y para qué</h2>
        <p>
          Nombre y apellido, DNI, celular, correo electrónico, cobertura médica, número de afiliada y, solo si tu cobertura lo exige, fecha de
          nacimiento. Los usamos exclusivamente para gestionar tus turnos: reservarlos, confirmarlos, enviarte recordatorios y permitirte
          cancelarlos o reprogramarlos. No pedimos ni guardamos información clínica ni motivos de consulta.
        </p>
        <h2>Comunicaciones</h2>
        <p>
          Al reservar te enviamos la confirmación con tu enlace personal. Los recordatorios (48 y 24 horas antes) solo se envían si los
          autorizás. Los mensajes se envían por WhatsApp (Meta Platforms) y/o correo electrónico. Podés retirar tu autorización en cualquier
          momento pidiéndolo por los canales de contacto.
        </p>
        <h2>Con quién se comparten</h2>
        <p>
          Con nadie con fines comerciales. Usamos proveedores tecnológicos para alojar la aplicación y la base de datos, sincronizar la agenda
          con Google Calendar y enviar mensajes. En el calendario solo figura tu nombre, tu cobertura y el tipo de consulta.
        </p>
        <h2>Seguridad</h2>
        <p>
          La conexión está cifrada (HTTPS), el acceso a la agenda está restringido con usuario y contraseña, y tu enlace personal no contiene
          datos tuyos. Si lo compartís, quien lo tenga podrá ver y modificar tu turno: no lo reenvíes.
        </p>
        <h2>Tus derechos</h2>
        <p>
          Podés solicitar el acceso, la rectificación, la actualización o la supresión de tus datos en forma gratuita (art. 14 a 16, Ley
          25.326). El derecho de acceso puede ejercerse en intervalos no inferiores a seis meses, salvo interés legítimo. La AGENCIA DE ACCESO A
          LA INFORMACIÓN PÚBLICA, órgano de control de la Ley 25.326, atiende las denuncias y reclamos relacionados con el incumplimiento de
          las normas sobre protección de datos personales.
        </p>
        <h2>Conservación</h2>
        <p>Conservamos los datos administrativos de los turnos mientras sean necesarios para la atención y las obligaciones legales aplicables.</p>
        {s.privacyExtra && <p className="whitespace-pre-line">{s.privacyExtra}</p>}
      </article>
    </PublicShell>
  );
}
