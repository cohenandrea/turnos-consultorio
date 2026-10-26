import Link from "next/link";
import Image from "next/image";
import { initialsOf, PublicShell } from "@/components/PublicShell";
import { CalendarIcon, CheckIcon, ClockIcon, PinIcon, ShieldIcon, WhatsAppIcon } from "@/components/icons";
import { getPublicConfig } from "@/lib/services/config";
import { PrescriptionNotice } from "@/components/PrescriptionNotice";
import { contactMailto } from "@/components/contact";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const c = await getPublicConfig();
  return { title: `${c.professionalName} · ${c.specialty}`, description: `Reservá tu turno online con ${c.professionalName}, ${c.specialty}.` };
}

export default async function Home() {
  const c = await getPublicConfig();
  const wa = c.whatsappContact?.replace(/\D/g, "");
  return (
    <PublicShell config={c} wide>
      {/* Presentación */}
      <section className="relative -mx-4 -mt-6 overflow-hidden bg-gradient-to-b from-soft to-paper px-4 pt-10 pb-8 text-center">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" aria-hidden />
        <div className="relative">
          {c.photoUrl ? (
            <Image src={c.photoUrl} alt={c.professionalName} width={128} height={128} className="mx-auto h-32 w-32 rounded-full object-cover ring-4 ring-white shadow-lg" />
          ) : (
            <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-brand text-4xl font-extrabold text-on-brand ring-4 ring-white shadow-lg">
              {initialsOf(c.professionalName)}
            </div>
          )}
          <p className="mt-6 text-xs font-extrabold tracking-[0.18em] text-brand uppercase">Médica especialista</p>
          <h1 className="mt-1 text-[34px] leading-tight font-extrabold text-accent">{c.professionalName}</h1>
          <p className="mt-1 text-lg font-semibold text-ink">{c.specialty}</p>
          {c.bio && <p className="mx-auto mt-3 max-w-md text-[16px] text-muted">{c.bio}</p>}

          <div className="mx-auto mt-7 grid max-w-md gap-3">
            <Link href="/reservar" className="btn-primary w-full py-4 text-lg">
              <CalendarIcon className="h-6 w-6" /> Reservar turno
            </Link>
            <Link href="/mi-turno" className="btn-secondary w-full">
              Ya tengo turno: consultar o cambiar
            </Link>
          </div>

          {c.opensLabel && (
            <p className="mx-auto mt-4 max-w-md rounded-2xl bg-white/80 px-4 py-2.5 text-[15px] font-bold text-accent">
              Turnos disponibles a partir del {c.opensLabel}
            </p>
          )}
          <ul className="mx-auto mt-6 flex max-w-md flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-semibold text-muted">
            {["Confirmación inmediata", "Recordatorios automáticos", "Cambios online"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CheckIcon className="h-4 w-4 text-brand" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {c.prescription && (
        <section className="mx-auto mt-6 max-w-md">
          <PrescriptionNotice prescription={c.prescription} />
        </section>
      )}

      {/* Consultorios */}
      <section className="mt-8">
        <h2 className="mb-3 text-xl font-extrabold text-accent">Dónde atiendo</h2>
        <div className={`grid gap-4 ${c.locations.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {c.locations.map((l) => (
            <article key={l.id} className="card flex flex-col">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft text-brand">
                  <PinIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[17px] font-extrabold">{l.name}</h3>
                  <p className="text-[15px] text-ink">{l.address}</p>
                </div>
              </div>
              {l.hours.length > 0 && (
                <ul className="mt-4 space-y-1.5 border-t border-line pt-4">
                  {l.hours.map((h, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 text-[15px]">
                      <span className="flex items-center gap-2 font-bold">
                        <ClockIcon className="h-4 w-4 text-brand" /> {h.day}
                      </span>
                      <span className="text-muted">
                        {h.from} a {h.to} hs.
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {l.mapsUrl && (
                <a href={l.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-4 text-[15px] font-bold text-brand underline underline-offset-4">
                  Cómo llegar
                </a>
              )}
            </article>
          ))}
        </div>
        {c.attentionInfo && (
          <p className="mt-4 flex gap-2.5 rounded-2xl bg-soft px-4 py-3 text-[15px] text-ink">
            <ShieldIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand" /> {c.attentionInfo}
          </p>
        )}
      </section>

      {/* Coberturas */}
      <section className="mt-10">
        <h2 className="mb-3 text-xl font-extrabold text-accent">Coberturas</h2>
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {c.coverages.map((cov) => (
            <li key={cov.id} className="flex items-center gap-2 rounded-2xl border border-line bg-white px-3.5 py-3 text-[15px] font-bold">
              <CheckIcon className="h-4 w-4 shrink-0 text-brand" /> {cov.name}
            </li>
          ))}
        </ul>
      </section>

      {/* Llamado final */}
      <section className="mt-10 rounded-3xl bg-accent px-6 py-8 text-center text-white">
        <p className="text-xl font-extrabold">Reservá tu turno en menos de dos minutos</p>
        <p className="mt-1 text-white/80">Elegís el horario y recibís la confirmación al instante.</p>
        <Link href="/reservar" className="btn mt-5 bg-white text-accent hover:bg-soft">
          <CalendarIcon /> Reservar turno
        </Link>
      </section>

      {c.contactEmail && (
        <section className="card mt-8 text-center">
          <h2 className="text-xl font-extrabold text-accent">Contactar</h2>
          <p className="mt-1 text-[15px] text-muted">¿Tenés alguna consulta o necesitás información? Escribinos.</p>
          <a href={contactMailto(c.contactEmail)} className="btn-secondary mt-4 w-full sm:w-auto">
            Contactar por correo
          </a>
          <p className="mt-2 text-sm font-semibold break-all text-accent">{c.contactEmail}</p>
        </section>
      )}

      {wa && (
        <section className="mt-8 text-center">
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
