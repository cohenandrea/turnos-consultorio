"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";

export function ExceptionForm({ action, locations, today }: { action: (f: FormData) => Promise<void>; locations: { id: number; name: string }[]; today: string }) {
  const [kind, setKind] = useState("block");
  const [allDay, setAllDay] = useState(false);
  const range = kind === "vacation" || kind === "holiday";
  const timed = kind === "extra" || (kind === "block" && !allDay);
  return (
    <form action={action} className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        {[
          ["block", "Bloquear horario"],
          ["vacation", "Vacaciones"],
          ["holiday", "Feriado"],
          ["extra", "Horario especial"],
        ].map(([v, l]) => (
          <button key={v} type="button" onClick={() => setKind(v)} aria-pressed={kind === v} className={`min-h-11 rounded-xl border text-sm font-semibold ${kind === v ? "border-brand bg-brand/5 text-brand" : "border-line"}`}>
            {l}
          </button>
        ))}
      </div>
      <input type="hidden" name="kind" value={kind} />
      {kind === "extra" && <p className="text-sm text-muted">Agrega atención fuera del horario habitual (por ejemplo, un sábado puntual).</p>}
      {kind === "block" && (
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-5 w-5 accent-[var(--color-brand)]" /> Día(s) completo(s)
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label text-sm">{range || allDay ? "Desde el día" : "Día"}</span>
          <input className="input" type="date" name="fromDate" defaultValue={today} required />
        </label>
        {(range || allDay) && (
          <label className="block">
            <span className="label text-sm">Hasta el día (inclusive)</span>
            <input className="input" type="date" name="toDate" />
          </label>
        )}
      </div>
      {timed && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label text-sm">Desde</span>
            <input className="input" type="time" name="fromTime" defaultValue="09:00" required />
          </label>
          <label className="block">
            <span className="label text-sm">Hasta</span>
            <input className="input" type="time" name="toTime" defaultValue="10:00" required />
          </label>
        </div>
      )}
      <label className="block">
        <span className="label text-sm">Descripción (opcional, solo la ves vos)</span>
        <input className="input" name="title" />
      </label>
      {locations.length > 1 && (
        <label className="block">
          <span className="label text-sm">Sede</span>
          <select className="input" name="locationId">
            <option value="">Todas</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      )}
      <SubmitButton className="btn-primary">Guardar</SubmitButton>
    </form>
  );
}
