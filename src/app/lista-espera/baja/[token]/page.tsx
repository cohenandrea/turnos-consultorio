import { PublicShell } from "@/components/PublicShell";
import { getPublicConfig } from "@/lib/services/config";
import { leaveWaitlist } from "@/lib/services/waitlist";

export const dynamic = "force-dynamic";

export default async function Baja({ params }: { params: Promise<{ token: string }> }) {
  const ok = await leaveWaitlist((await params).token);
  return (
    <PublicShell config={await getPublicConfig()}>
      <div className="card text-center">
        <p className="text-lg font-semibold">{ok ? "Listo, ya no vas a recibir avisos de la lista de espera." : "El enlace no es válido."}</p>
      </div>
    </PublicShell>
  );
}
