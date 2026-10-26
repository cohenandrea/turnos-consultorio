import type { PublicConfig } from "@/lib/services/config";
import { CardIcon } from "./icons";

/** Aviso con el enlace de registro para recetas y órdenes electrónicas. */
export function PrescriptionNotice({ prescription }: { prescription: PublicConfig["prescription"] }) {
  if (!prescription) return null;
  return (
    <aside className="rounded-3xl border border-brand/30 bg-white p-5 text-left shadow-[0_8px_30px_-12px_rgba(122,46,69,0.12)]">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft text-brand">
          <CardIcon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[17px] font-extrabold text-accent">Recetas y órdenes electrónicas</p>
          <p className="mt-1 text-[15px] text-ink">
            {prescription.note || "Para recibir recetas y órdenes electrónicas es necesario completar este formulario."}
          </p>
        </div>
      </div>
      <a href={prescription.url} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-4 w-full">
        Completar formulario
      </a>
    </aside>
  );
}
