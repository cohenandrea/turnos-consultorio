import type { Metadata } from "next";
import { PublicShell } from "@/components/PublicShell";
import { isWhatsAppConfigured } from "@/lib/env";
import { getPublicConfig } from "@/lib/services/config";
import { availableOtpChannels } from "@/lib/services/otp";
import { BookingWizard } from "./BookingWizard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reservar un turno" };

export default async function ReservarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const config = await getPublicConfig();
  const fecha = sp.fecha && /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha) ? sp.fecha : undefined;
  return (
    <PublicShell config={config}>
      <BookingWizard
        config={config}
        initialCoverage={sp.cobertura?.toLowerCase()}
        initialType={sp.tipo?.toLowerCase()}
        initialDate={fecha}
        otpChannels={availableOtpChannels()}
        emailRequired={!isWhatsAppConfigured()}
      />
    </PublicShell>
  );
}
