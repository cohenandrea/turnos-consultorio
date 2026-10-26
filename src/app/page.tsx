import Link from "next/link";
import Image from "next/image";
import { PublicShell } from "@/components/PublicShell";
import { CalendarIcon, ClockIcon, PinIcon, WhatsAppIcon } from "@/components/icons";
import { getPublicConfig } from "@/lib/services/config";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const c = await getPublicConfig();
  return { title: `${c.professionalName} · Turnos`, description: `Reservá tu turno online con ${c.professionalName}, ${c.specialty}.` };
}

export default async function Home() {
  const c = await getPublicConfig();
  const wa = c.whatsappContact?.replace(/\D/g, "");
  return (
    <PublicShell config={c}>
      <section className="pt-4 text-center">
        {c.photoUrl ? (
          <Image src={c.photoUrl} alt={c.professionalName} width={112} height={112} className="mx-auto h-28 w-28 rounded-full object-cover ring-4 ring-white" />
        ) : (
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-brand/10 font-display text-3xl font-semibold text-brand">
            {c.professionalName.replace(/^(Dra?\.|Lic\.)\s*/i, "").split(" ").map((w) => w[0]).slice(0, 2).join("")}
          </div>
        )}
        <h1 className="mt-5 font-display text-[34px] leading-tight font-semibold">{c.professionalName}</h1>
        <p className="mt-1 text-lg text-muted">{c.specialty}</p>
        {c.bio && <p className="mx-auto mt-4 max-w-md text-[17px] text-ink/80">{c.bio}</p>}
      </section>

      <section className="mt-8 space-y-3">
        <Link href="/reservar" className="btn-primary w-full py-4 text-lg">
          <CalendarIcon className="h-6 w-6" /> Reservar un turno
        </Link>
        <Link href="/mi-turno" className="btn-secondary w-full">
          Consultar, cancelar o reprogramar mi turno
        </Link>
        <p className="text-center text-sm text-muted">Reservás en menos de dos minutos, sin llamar ni esperar respuesta.</p>
      </section>

      <section className="card mt-8 space-y-4">
        {c.locations.map((l) => (
          <div key={l.id} className="flex gap-3">
            <PinIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            <div>
              {c.locations.length > 1 && <p className="font-semibold">{l.name}</p>}
              <p>{l.address}</p>
              {l.notes && <p className="text-[15px] text-muted">{l.notes}</p>}
              {l.mapsUrl && (
                <a href={l.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-[15px] font-semibold text-brand underline underline-offset-4">
                  Ver en el mapa
                </a>
              )}
            </div>
          </div>
        ))}
        {c.attentionInfo && (
          <div className="flex gap-3">
            <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            <p className="text-ink/90">{c.attentionInfo}</p>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-center text-sm font-semibold tracking-wide text-muted uppercase">Coberturas</h2>
        <ul className="mt-3 flex flex-wrap justify-center gap-2">
          {c.coverages.map((cov) => (
            <li key={cov.id} className="rounded-full border border-line bg-white px-3.5 py-1.5 text-[15px]">
              {cov.name}
            </li>
          ))}
        </ul>
      </section>

      {wa && (
        <section className="mt-10 text-center">
          <a
            href={`https://wa.me/${wa}?text=${encodeURIComponent("Hola, necesito ayuda con un turno.")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost"
          >
            <WhatsAppIcon /> ¿Necesitás ayuda? Escribinos por WhatsApp
          </a>
        </section>
      )}
    </PublicShell>
  );
}
