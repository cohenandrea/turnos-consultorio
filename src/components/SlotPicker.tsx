"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import type { SerializedSlot } from "@/lib/services/availability-service";
import { CalendarIcon, ChevronLeft, ChevronRight, ClockIcon } from "./icons";

type SuggestResponse = { suggestions: SerializedSlot[]; hasAny: boolean; minMonth: string; maxMonth: string };
type MonthResponse = { days: Record<string, SerializedSlot[]>; minMonth: string; maxMonth: string };

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const WEEK = ["L", "M", "M", "J", "V", "S", "D"];

function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function SlotPicker({
  query,
  onSelect,
  selectedStart,
  initialDate,
  heading = "Estos son los próximos turnos disponibles para vos:",
  onNoneFit,
  reloadKey = 0,
}: {
  /** "coverage=1&type=2" o "token=…" */
  query: string;
  onSelect: (slot: SerializedSlot) => void;
  selectedStart?: string;
  initialDate?: string;
  heading?: string;
  /** Si se pasa, se ofrece anotarse en la lista de espera. */
  onNoneFit?: () => void;
  reloadKey?: number;
}) {
  const [data, setData] = useState<SuggestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(Boolean(initialDate));
  const [month, setMonth] = useState<string | null>(initialDate ? initialDate.slice(0, 7) : null);
  const [monthData, setMonthData] = useState<MonthResponse | null>(null);
  const [monthLoading, setMonthLoading] = useState(false);
  const [day, setDay] = useState<string | null>(initialDate ?? null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    apiFetch<SuggestResponse>(`/api/slots?${query}`)
      .then((r) => {
        if (!alive) return;
        setData(r);
        setMonth((m) => m ?? r.suggestions[0]?.dateKey.slice(0, 7) ?? r.minMonth);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [query, reloadKey]);

  useEffect(() => {
    if (!showCalendar || !month) return;
    let alive = true;
    setMonthLoading(true);
    apiFetch<MonthResponse>(`/api/slots?${query}&mode=month&month=${month}`)
      .then((r) => alive && setMonthData(r))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setMonthLoading(false));
    return () => {
      alive = false;
    };
  }, [showCalendar, month, query, reloadKey]);

  const grid = useMemo(() => {
    if (!month) return [];
    const [y, m] = month.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const offset = (first.getUTCDay() + 6) % 7; // lunes primero
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells: (string | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
    return cells;
  }, [month]);

  if (error)
    return (
      <div className="alert-error" role="alert">
        {error}
      </div>
    );
  if (!data)
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Buscando turnos disponibles">
        <p className="text-muted">Buscando los próximos turnos…</p>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-soft" />
        ))}
      </div>
    );

  const daySlots = day ? (monthData?.days[day] ?? []) : [];
  const morning = daySlots.filter((s) => Number(s.time.slice(0, 2)) < 13);
  const afternoon = daySlots.filter((s) => Number(s.time.slice(0, 2)) >= 13);
  const min = monthData?.minMonth ?? data.minMonth;
  const max = monthData?.maxMonth ?? data.maxMonth;

  const SlotButton = ({ s }: { s: SerializedSlot }) => (
    <button
      type="button"
      onClick={() => onSelect(s)}
      aria-pressed={selectedStart === s.start}
      className={`min-h-12 rounded-xl border px-3 text-base font-semibold transition ${
        selectedStart === s.start ? "border-brand bg-brand text-on-brand" : "border-line bg-white hover:border-brand"
      }`}
    >
      {s.time}
      {s.locationName ? <span className="block text-xs font-normal">{s.locationName}</span> : null}
    </button>
  );

  return (
    <div className="space-y-5">
      {data.suggestions.length > 0 ? (
        <>
          <p className="text-lg font-medium">{heading}</p>
          <ul className="space-y-3">
            {data.suggestions.map((s) => {
              const selected = selectedStart === s.start;
              return (
                <li key={s.start + s.locationId}>
                  <button
                    type="button"
                    onClick={() => onSelect(s)}
                    aria-pressed={selected}
                    className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${
                      selected ? "border-brand bg-brand/5 ring-2 ring-brand/30" : "border-line bg-white hover:border-brand"
                    }`}
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-soft text-brand">
                      <CalendarIcon className="h-6 w-6" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-[17px] font-semibold">{s.dateLabel}</span>
                      <span className="flex items-center gap-1.5 text-muted">
                        <ClockIcon className="h-4 w-4" /> {s.time} hs.{s.locationName ? ` · ${s.locationName}` : ""}
                      </span>
                    </span>
                    <span className={`rounded-xl px-4 py-2 text-sm font-semibold ${selected ? "bg-brand text-on-brand" : "bg-soft text-brand"}`}>
                      {selected ? "Elegido" : "Elegir"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className="alert-info">
          <p className="font-semibold">Por ahora no hay turnos disponibles.</p>
          <p className="text-muted">Probá más adelante o anotate para que te avisemos si se libera uno.</p>
        </div>
      )}

      {data.hasAny && !showCalendar && (
        <div className="rounded-2xl bg-soft p-4 text-center">
          <p className="mb-2 text-muted">¿Ninguno de estos horarios te queda cómodo?</p>
          <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => setShowCalendar(true)}>
            <CalendarIcon /> Ver más turnos
          </button>
        </div>
      )}

      {showCalendar && month && (
        <section aria-label="Calendario de turnos" className="rounded-2xl border border-line bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-soft disabled:opacity-30"
              onClick={() => {
                setMonth(addMonths(month, -1));
                setDay(null);
              }}
              disabled={month <= min}
              aria-label="Mes anterior"
            >
              <ChevronLeft />
            </button>
            <h3 className="text-lg font-semibold capitalize">
              {MONTHS[Number(month.slice(5)) - 1]} {month.slice(0, 4)}
            </h3>
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-soft disabled:opacity-30"
              onClick={() => {
                setMonth(addMonths(month, 1));
                setDay(null);
              }}
              disabled={month >= max}
              aria-label="Mes siguiente"
            >
              <ChevronRight />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-sm text-muted" aria-hidden>
            {WEEK.map((w, i) => (
              <div key={i} className="py-1 font-semibold">
                {w}
              </div>
            ))}
          </div>
          <div className={`grid grid-cols-7 gap-1 ${monthLoading ? "opacity-50" : ""}`}>
            {grid.map((d, i) => {
              if (!d) return <div key={i} />;
              const available = (monthData?.days[d]?.length ?? 0) > 0;
              const selected = d === day;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={!available}
                  onClick={() => setDay(d)}
                  aria-label={`${Number(d.slice(8))} de ${MONTHS[Number(d.slice(5, 7)) - 1]}${available ? ", con turnos" : ", sin turnos"}`}
                  aria-pressed={selected}
                  className={`aspect-square min-h-11 rounded-xl text-base font-semibold transition ${
                    selected
                      ? "bg-brand text-on-brand"
                      : available
                        ? "bg-brand/10 text-brand hover:bg-brand/20"
                        : "text-[#b9b2a9]"
                  }`}
                >
                  {Number(d.slice(8))}
                </button>
              );
            })}
          </div>
          {!monthLoading && monthData && Object.keys(monthData.days).length === 0 && (
            <p className="mt-3 text-center text-muted">No hay turnos libres este mes.</p>
          )}
          {day && daySlots.length > 0 && (
            <div className="mt-5 space-y-4">
              <p className="font-semibold">{daySlots[0].dateLabel}</p>
              {[
                ["Mañana", morning],
                ["Tarde", afternoon],
              ].map(([label, list]) =>
                (list as SerializedSlot[]).length ? (
                  <div key={label as string}>
                    <p className="mb-2 text-sm font-semibold text-muted">{label as string}</p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {(list as SerializedSlot[]).map((s) => (
                        <SlotButton key={s.start + s.locationId} s={s} />
                      ))}
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          )}
          {!day && <p className="mt-3 text-center text-sm text-muted">Tocá un día resaltado para ver los horarios.</p>}
        </section>
      )}

      {onNoneFit && (
        <p className="text-center text-[15px] text-muted">
          ¿No encontrás un horario que te sirva?{" "}
          <button type="button" onClick={onNoneFit} className="font-semibold text-brand underline underline-offset-4">
            Avisame si se libera un turno antes
          </button>
        </p>
      )}
    </div>
  );
}
