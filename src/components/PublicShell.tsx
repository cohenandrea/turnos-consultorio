import Link from "next/link";
import { brandStyle } from "@/lib/color";
import type { PublicConfig } from "@/lib/services/config";
import { contactMailto } from "./contact";

export function initialsOf(name: string) {
  return name
    .replace(/^(Dra?\.|Lic\.)\s*/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
}

export function PublicShell({ config, children, wide = false }: { config: PublicConfig; children: React.ReactNode; wide?: boolean }) {
  const width = wide ? "max-w-3xl" : "max-w-xl";
  return (
    <div style={brandStyle(config.primaryColor, config.accentColor)} className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-white/90 backdrop-blur">
        <div className={`mx-auto flex items-center justify-between gap-3 px-4 py-3 ${width}`}>
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-extrabold tracking-wide text-on-brand">
              {initialsOf(config.professionalName)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[17px] leading-tight font-extrabold text-accent">{config.professionalName}</span>
              <span className="block truncate text-[13px] text-muted">{config.specialty}</span>
            </span>
          </Link>
          <Link href="/mi-turno" className="shrink-0 rounded-full border border-brand/25 px-3.5 py-2 text-sm font-bold text-accent hover:bg-soft">
            Mi turno
          </Link>
        </div>
      </header>
      <main className={`mx-auto w-full flex-1 px-4 pt-6 pb-16 ${width}`}>{children}</main>
      <footer className="border-t border-line bg-white py-6 text-center text-sm text-muted">
        <p className="font-bold text-accent">{config.professionalName}</p>
        <p>{config.specialty}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1">
          {config.contactEmail && (
            <a href={contactMailto(config.contactEmail)} className="font-bold text-accent underline underline-offset-4">
              Contactar
            </a>
          )}
          <Link href="/privacidad" className="underline underline-offset-4">
            Privacidad y tratamiento de datos
          </Link>
        </div>
      </footer>
    </div>
  );
}
