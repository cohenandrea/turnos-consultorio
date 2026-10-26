import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import { findByToken } from "@/lib/services/booking";
import { getPublicConfig } from "@/lib/services/config";
import { appointmentView } from "@/lib/services/views";
import { ManageView } from "./ManageView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mi turno", robots: { index: false, follow: false } };

export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [config, appt] = await Promise.all([getPublicConfig(), findByToken(token)]);
  return (
    <PublicShell config={config}>
      {appt ? (
        <ManageView token={token} initial={await appointmentView(appt)} waitlistEnabled={config.waitlistEnabled} />
      ) : (
        <div className="card space-y-4 text-center">
          <h1 className="font-display text-2xl font-semibold">Este enlace no es válido</h1>
          <p className="text-muted">Puede que haya vencido o que se haya generado uno nuevo. Podés pedir que te lo reenviemos.</p>
          <Link href="/mi-turno" className="btn-primary w-full">
            Recuperar mi enlace
          </Link>
        </div>
      )}
    </PublicShell>
  );
}
