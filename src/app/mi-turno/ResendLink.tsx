"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";

export function ResendLink({ channels, whatsappContact }: { channels: { whatsapp: boolean; email: boolean }; whatsappContact: string | null }) {
  const [channel, setChannel] = useState<"whatsapp" | "email">(channels.whatsapp ? "whatsapp" : "email");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wa = whatsappContact?.replace(/\D/g, "");

  if (!channels.whatsapp && !channels.email)
    return (
      <div className="alert-info">
        Para consultar tu turno usá el enlace que te enviamos{wa ? <>, o <a className="font-semibold text-brand underline" href={`https://wa.me/${wa}`}>escribinos por WhatsApp</a></> : ""}.
      </div>
    );
  if (done)
    return (
      <div className="alert-ok">
        Si encontramos un turno con ese dato, te reenviamos el enlace. Revisá tu {channel === "whatsapp" ? "WhatsApp" : "correo (y la carpeta de spam)"}.
      </div>
    );

  return (
    <form
      className="card space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await apiFetch("/api/manage-link", { body: { channel, value } });
          setDone(true);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="font-semibold">¿No encontrás el enlace? Te lo reenviamos</p>
      {channels.whatsapp && channels.email && (
        <div className="grid grid-cols-2 gap-2">
          {(["whatsapp", "email"] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={channel === c}
              onClick={() => setChannel(c)}
              className={`min-h-11 rounded-xl border text-[15px] font-semibold ${channel === c ? "border-brand bg-brand/5 text-brand" : "border-line"}`}
            >
              {c === "whatsapp" ? "WhatsApp" : "Correo"}
            </button>
          ))}
        </div>
      )}
      <label className="block">
        <span className="label">{channel === "whatsapp" ? "Celular con el que reservaste" : "Correo con el que reservaste"}</span>
        <input className="input" type={channel === "email" ? "email" : "tel"} value={value} onChange={(e) => setValue(e.target.value)} required />
      </label>
      {error && <p className="field-error">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Enviando…" : "Reenviarme el enlace"}
      </button>
    </form>
  );
}
