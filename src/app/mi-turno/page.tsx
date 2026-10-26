import type { Metadata } from "next";
import { PublicShell } from "@/components/PublicShell";
import { isEmailConfigured, isWhatsAppConfigured } from "@/lib/env";
import { getPublicConfig } from "@/lib/services/config";
import { ResendLink } from "./ResendLink";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mi turno" };

export default async function MiTurno() {
  const config = await getPublicConfig();
  return (
    <PublicShell config={config}>
      <h1 className="font-display text-[26px] font-extrabold text-accent">Consultar, cancelar o reprogramar</h1>
      <p className="mt-2 text-muted">
        Cuando reservaste te enviamos un enlace personal para gestionar tu turno. Buscalo en tu WhatsApp o tu correo.
      </p>
      <div className="mt-6">
        <ResendLink channels={{ whatsapp: isWhatsAppConfigured(), email: isEmailConfigured() }} whatsappContact={config.whatsappContact} />
      </div>
    </PublicShell>
  );
}
