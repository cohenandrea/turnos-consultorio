import Link from "next/link";
import { brandStyle } from "@/lib/color";
import type { PublicConfig } from "@/lib/services/config";

export function PublicShell({ config, children, narrow = true }: { config: PublicConfig; children: React.ReactNode; narrow?: boolean }) {
  return (
    <div style={brandStyle(config.primaryColor, config.accentColor)} className="min-h-dvh">
      <header className="border-b border-line/70 bg-paper/90 backdrop-blur">
        <div className={`mx-auto flex items-center justify-between px-4 py-3 ${narrow ? "max-w-xl" : "max-w-3xl"}`}>
          <Link href="/" className="font-display text-lg font-semibold text-ink">
            {config.professionalName}
          </Link>
          <span className="text-sm text-muted">{config.specialty}</span>
        </div>
      </header>
      <main className={`mx-auto px-4 pt-6 pb-16 ${narrow ? "max-w-xl" : "max-w-3xl"}`}>{children}</main>
      <footer className="border-t border-line/70 py-6 text-center text-sm text-muted">
        <Link href="/privacidad" className="underline underline-offset-4">
          Privacidad y tratamiento de datos
        </Link>
      </footer>
    </div>
  );
}
