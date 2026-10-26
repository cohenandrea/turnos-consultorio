"use client";

import { useEffect, useState } from "react";

/** Fecha + hora, con los horarios libres del día como atajo. Lee cobertura/tipo del formulario. */
export function FreeTimes({ defaultDate }: { defaultDate: string }) {
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [free, setFree] = useState<string[] | null>(null);
  const [form, setForm] = useState<HTMLFormElement | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!form) return;
    const onChange = (e: Event) => {
      const n = (e.target as HTMLInputElement).name;
      if (n === "coverageId" || n === "consultationTypeId") setTick((t) => t + 1);
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, [form]);

  useEffect(() => {
    if (!form || !date) return;
    const fd = new FormData(form);
    const q = new URLSearchParams({ coverage: String(fd.get("coverageId")), type: String(fd.get("consultationTypeId")), date });
    setFree(null);
    fetch(`/api/admin/slots?${q}`)
      .then((r) => r.json())
      .then((j) => setFree(j.times ?? []))
      .catch(() => setFree([]));
  }, [date, form, tick]);

  return (
    <div ref={(el) => setForm(el?.closest("form") ?? null)} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label text-sm">Fecha</span>
          <input className="input" type="date" name="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="label text-sm">Hora</span>
          <input className="input" type="time" name="time" required step={300} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-semibold text-muted">Horarios libres ese día</p>
        {free === null ? (
          <p className="text-sm text-muted">Buscando…</p>
        ) : free.length === 0 ? (
          <p className="text-sm text-muted">No hay horarios libres (podés cargar un sobreturno).</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {free.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTime(t)}
                className={`rounded-lg border px-2.5 py-1.5 text-sm font-semibold ${time === t ? "border-brand bg-brand text-on-brand" : "border-line hover:border-brand"}`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
