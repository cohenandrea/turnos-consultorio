import QRCode from "qrcode";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { getActiveCoverages } from "@/lib/services/config";
import { PageHeader, Section } from "@/components/admin";
import { CopyButton } from "@/components/CopyButton";

async function qr(text: string) {
  return QRCode.toString(text, { type: "svg", margin: 1, width: 180, color: { dark: "#2a2723", light: "#ffffff" } });
}

export default async function Compartir() {
  await requireAdmin("owner");
  const base = env.appUrl();
  const covs = await getActiveCoverages();
  const main = `${base}/reservar`;
  const items = await Promise.all(covs.filter((c) => c.kind !== "particular").map(async (c) => ({ c, url: `${base}/reservar?cobertura=${c.slug}`, svg: await qr(`${base}/reservar?cobertura=${c.slug}`) })));
  const mainSvg = await qr(main);
  const waMsg = `Hola! Podés reservar tu turno online, elegir el horario que más te convenga y recibir recordatorios: ${main}`;
  return (
    <>
      <PageHeader title="Enlaces y códigos QR" subtitle="Para WhatsApp, redes, tu perfil profesional y las cartillas de las prepagas." />
      <Section title="Enlace general">
        <div className="flex flex-wrap items-center gap-6">
          <div className="h-[180px] w-[180px] shrink-0 rounded-xl border border-line" dangerouslySetInnerHTML={{ __html: mainSvg }} />
          <div className="min-w-0 flex-1 space-y-3">
            <p className="font-mono text-lg break-all">{main}</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={main} label="Copiar enlace" />
              <CopyButton text={waMsg} label="Copiar mensaje para WhatsApp" />
              <a className="btn-secondary min-h-10 px-3 text-sm" download="qr-turnos.svg" href={`data:image/svg+xml;utf8,${encodeURIComponent(mainSvg)}`}>Descargar QR</a>
            </div>
            <p className="text-sm text-muted">Sugerencia: configurá este enlace como respuesta automática o mensaje de ausencia en WhatsApp Business.</p>
          </div>
        </div>
      </Section>
      <Section title="Un enlace por cobertura" description="Usalos en la cartilla de cada prepaga (si permite cargar un enlace de reserva): la paciente entra con su cobertura ya elegida.">
        <div className="grid gap-4 md:grid-cols-2">
          {items.map(({ c, url, svg }) => (
            <div key={c.id} id={c.slug} className="flex gap-4 rounded-2xl border border-line p-4">
              <div className="h-[110px] w-[110px] shrink-0 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
              <div className="min-w-0 space-y-2">
                <p className="font-semibold">{c.name}</p>
                <p className="font-mono text-xs break-all text-muted">{url}</p>
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={url} />
                  <a className="btn-secondary min-h-10 px-3 text-sm" download={`qr-${c.slug}.svg`} href={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}>QR</a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
