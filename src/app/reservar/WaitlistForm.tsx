"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";
import { CheckIcon } from "@/components/icons";

export function WaitlistForm({ coverageId, typeId, onClose }: { coverageId: number; typeId: number; onClose: () => void }) {
  const [f, setF] = useState({ fullName: "", phone: "", email: "", wantsBefore: "", timePreference: "any", consent: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done)
    return (
      <div className="card space-y-3 text-center">
        <CheckIcon className="mx-auto h-10 w-10 text-brand" />
        <p className="text-lg font-semibold">¡Listo! Te anotamos en la lista de espera.</p>
        <p className="text-muted">Si se libera un turno que te sirva, te avisamos. Se asigna a quien lo confirme primero.</p>
        <button type="button" className="btn-secondary w-full" onClick={onClose}>
          Volver a los turnos
        </button>
      </div>
    );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/waitlist", { body: { ...f, coverageId, consultationTypeId: typeId, wantsBefore: f.wantsBefore || null } });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card space-y-4" onSubmit={submit}>
      <div>
        <h2 className="text-xl font-semibold">Avisame si se libera un turno</h2>
        <p className="text-[15px] text-muted">Te escribimos cuando alguien cancele y quede un horario disponible.</p>
      </div>
      <label className="block">
        <span className="label">Nombre y apellido</span>
        <input className="input" required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
      </label>
      <label className="block">
        <span className="label">Celular con WhatsApp</span>
        <input className="input" type="tel" required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      </label>
      <label className="block">
        <span className="label">Correo electrónico (opcional)</span>
        <input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </label>
      <label className="block">
        <span className="label">Avisame si aparece un turno antes del (opcional)</span>
        <input className="input" type="date" value={f.wantsBefore} onChange={(e) => setF({ ...f, wantsBefore: e.target.value })} />
      </label>
      <fieldset>
        <legend className="label">¿En qué horario preferís?</legend>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["any", "Cualquiera"],
            ["morning", "Mañana"],
            ["afternoon", "Tarde"],
          ].map(([v, l]) => (
            <button
              key={v}
              type="button"
              aria-pressed={f.timePreference === v}
              onClick={() => setF({ ...f, timePreference: v })}
              className={`min-h-11 rounded-xl border text-[15px] font-semibold ${f.timePreference === v ? "border-brand bg-brand/5 text-brand" : "border-line"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex items-start gap-3 text-[15px]">
        <input type="checkbox" className="mt-0.5 h-6 w-6 accent-[var(--color-brand)]" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
        <span>Acepto que me contacten por WhatsApp o correo para avisarme de turnos disponibles.</span>
      </label>
      {error && <p className="alert-error">{error}</p>}
      <div className="grid gap-2">
        <button className="btn-primary" disabled={busy}>
          {busy ? "Guardando…" : "Anotarme"}
        </button>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Volver a los turnos
        </button>
      </div>
    </form>
  );
}
