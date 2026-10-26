"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SlotPicker } from "@/components/SlotPicker";
import { CalendarIcon, CardIcon, CheckIcon, ClockIcon, PinIcon, UserIcon, WhatsAppIcon } from "@/components/icons";
import { apiFetch, ApiError } from "@/lib/client-api";
import type { SerializedSlot } from "@/lib/services/availability-service";
import type { AppointmentView } from "@/lib/services/views";
import type { PublicConfig } from "@/lib/services/config";
import { PrescriptionNotice } from "@/components/PrescriptionNotice";

type Mode = "view" | "reschedule" | "cancel" | "cancelled";

export function ManageView({
  token,
  initial,
  waitlistEnabled,
  prescription,
}: {
  token: string;
  initial: AppointmentView;
  waitlistEnabled: boolean;
  prescription: PublicConfig["prescription"];
}) {
  const router = useRouter();
  const [a, setA] = useState(initial);
  const [mode, setMode] = useState<Mode>(initial.status === "cancelled" ? "cancelled" : "view");
  const [pick, setPick] = useState<SerializedSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      return await apiFetch<{ appointment: AppointmentView; token?: string }>(`/api/manage/${token}`, { body });
    } catch (e) {
      const err = e as ApiError;
      setError(err.message);
      if (err.code === "SLOT_TAKEN" || err.code === "SLOT_UNAVAILABLE") {
        setPick(null);
        setReloadKey((k) => k + 1);
      }
      return null;
    } finally {
      setBusy(false);
    }
  }

  const wa = a.whatsappContact?.replace(/\D/g, "");
  const Details = (
    <div className="card space-y-3.5">
      <Item icon={<CalendarIcon />} value={a.dateLabel} />
      <Item icon={<ClockIcon />} value={`${a.time} hs.`} />
      <Item icon={<PinIcon />} value={a.address} sub={a.mapsUrl ? <a className="font-semibold text-brand underline" href={a.mapsUrl} target="_blank" rel="noopener noreferrer">Ver en el mapa</a> : undefined} />
      <Item icon={<UserIcon />} value={a.professional} sub={a.specialty} />
      <Item icon={<CardIcon />} value={a.coverageName} sub={a.typeName} />
    </div>
  );

  if (a.isPast && a.status !== "cancelled")
    return (
      <div className="space-y-5">
        <h1 className="font-display text-[26px] font-extrabold text-accent">Este turno ya pasó</h1>
        {Details}
        <Link href="/reservar" className="btn-primary w-full">
          Reservar un nuevo turno
        </Link>
      </div>
    );

  if (mode === "cancelled")
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          {notice ? <div className="alert-ok">{notice}</div> : null}
          <h1 className="font-display text-[26px] font-extrabold text-accent">Tu turno fue cancelado</h1>
          <p className="text-muted">
            El turno del {a.dateLabel.toLowerCase()} a las {a.time} hs. quedó liberado.
          </p>
        </div>
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">¿Querés elegir otra fecha?</h2>
          {error && <div className="alert-error">{error}</div>}
          {!pick ? (
            <SlotPicker query={`token=${encodeURIComponent(token)}`} reloadKey={reloadKey} onSelect={(s) => setPick(s)} heading="Estos son los próximos turnos disponibles:" />
          ) : (
            <ConfirmBox
              title="¿Reservamos este turno?"
              text={`${pick.dateLabel} a las ${pick.time} hs.`}
              confirmLabel="Sí, reservar"
              busy={busy}
              onCancel={() => setPick(null)}
              onConfirm={async () => {
                const r = await act({ action: "rebook", start: pick.start, locationId: pick.locationId });
                if (r?.token) router.replace(`/t/${r.token}?nuevo=1`);
              }}
            />
          )}
        </section>
      </div>
    );

  return (
    <div className="space-y-6">
      {notice && (
        <div className="alert-ok" role="status">
          {notice}
        </div>
      )}
      <div>
        <p className="text-muted">Hola, {a.firstName}</p>
        <h1 className="font-display text-[26px] font-extrabold text-accent">Tu próximo turno</h1>
      </div>
      {Details}
      {a.attendanceConfirmed && (
        <p className="flex items-center gap-2 font-semibold text-ok">
          <CheckIcon /> Confirmaste tu asistencia. ¡Te esperamos!
        </p>
      )}
      {a.instructions && <div className="alert-info">{a.instructions}</div>}
      {error && (
        <div className="alert-error" role="alert">
          {error}
        </div>
      )}

      {mode === "view" && (
        <div className="grid gap-3">
          {!a.attendanceConfirmed && (
            <button
              className="btn-primary"
              disabled={busy}
              onClick={async () => {
                const r = await act({ action: "confirm" });
                if (r) {
                  setA(r.appointment);
                  setNotice("¡Gracias por confirmar! Te esperamos.");
                }
              }}
            >
              <CheckIcon /> Confirmar asistencia
            </button>
          )}
          <button className="btn-secondary" disabled={!a.canReschedule} onClick={() => { setMode("reschedule"); setError(null); setNotice(null); }}>
            Reprogramar turno
          </button>
          <button className="btn-secondary text-danger" disabled={!a.canCancel} onClick={() => { setMode("cancel"); setError(null); setNotice(null); }}>
            Cancelar turno
          </button>
          {(!a.canCancel || !a.canReschedule) && (
            <p className="text-center text-[15px] text-muted">
              Los cambios online se pueden hacer hasta {Math.min(a.cancelLimitHours, a.rescheduleLimitHours)} horas antes del turno.
              {wa ? " Para cambios de último momento escribinos por WhatsApp." : ""}
            </p>
          )}
        </div>
      )}

      {mode === "cancel" && (
        <ConfirmBox
          title="¿Seguro que querés cancelar tu turno?"
          text={`${a.dateLabel} a las ${a.time} hs. El horario quedará disponible para otra paciente.`}
          confirmLabel="Sí, cancelar turno"
          cancelLabel="No, mantener mi turno"
          danger
          busy={busy}
          onCancel={() => setMode("view")}
          onConfirm={async () => {
            const r = await act({ action: "cancel" });
            if (r) {
              setA(r.appointment);
              setNotice("Cancelamos tu turno. Gracias por avisarnos.");
              setMode("cancelled");
            }
          }}
        />
      )}

      {mode === "reschedule" && (
        <section className="space-y-4">
          <div className="alert-info">Tu turno actual se mantiene hasta que confirmes el nuevo horario.</div>
          {!pick ? (
            <SlotPicker
              query={`token=${encodeURIComponent(token)}`}
              reloadKey={reloadKey}
              onSelect={(s) => setPick(s)}
              heading="Elegí tu nuevo horario:"
              onNoneFit={waitlistEnabled ? undefined : undefined}
            />
          ) : (
            <ConfirmBox
              title="¿Confirmás el cambio?"
              text={`Tu turno pasa del ${a.dateLabel.toLowerCase()} a las ${a.time} hs. al ${pick.dateLabel.toLowerCase()} a las ${pick.time} hs.`}
              confirmLabel="Confirmar nuevo horario"
              cancelLabel="Elegir otro"
              busy={busy}
              onCancel={() => setPick(null)}
              onConfirm={async () => {
                const r = await act({ action: "reschedule", start: pick.start, locationId: pick.locationId });
                if (r) {
                  setA(r.appointment);
                  setPick(null);
                  setMode("view");
                  setNotice("¡Listo! Tu turno fue reprogramado. Te enviamos la confirmación.");
                }
              }}
            />
          )}
          <button className="btn-ghost w-full" onClick={() => { setMode("view"); setPick(null); }}>
            Mantener mi turno actual
          </button>
        </section>
      )}

      <PrescriptionNotice prescription={prescription} />
      {wa && (
        <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="btn-ghost w-full">
          <WhatsAppIcon /> ¿Necesitás ayuda? Escribinos
        </a>
      )}
    </div>
  );
}

function Item({ icon, value, sub }: { icon: React.ReactNode; value: string; sub?: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-brand">{icon}</span>
      <div>
        <p className="font-semibold">{value}</p>
        {sub && <div className="text-[15px] text-muted">{sub}</div>}
      </div>
    </div>
  );
}

function ConfirmBox(props: {
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="card space-y-4" role="alertdialog" aria-labelledby="confirm-title">
      <h2 id="confirm-title" className="text-xl font-semibold">
        {props.title}
      </h2>
      <p className="text-ink/90">{props.text}</p>
      <div className="grid gap-2">
        <button className={props.danger ? "btn-danger" : "btn-primary"} disabled={props.busy} onClick={props.onConfirm}>
          {props.busy ? "Un momento…" : props.confirmLabel}
        </button>
        <button className="btn-secondary" disabled={props.busy} onClick={props.onCancel}>
          {props.cancelLabel ?? "Volver"}
        </button>
      </div>
    </div>
  );
}
