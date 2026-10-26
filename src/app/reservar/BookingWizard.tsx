"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SlotPicker } from "@/components/SlotPicker";
import { CalendarIcon, CardIcon, CheckIcon, ChevronLeft, ClockIcon, PinIcon, ShieldIcon, UserIcon } from "@/components/icons";
import { apiFetch, ApiError } from "@/lib/client-api";
import type { PublicConfig } from "@/lib/services/config";
import type { SerializedSlot } from "@/lib/services/availability-service";
import type { AppointmentView } from "@/lib/services/views";
import { WaitlistForm } from "./WaitlistForm";
import { PrescriptionNotice } from "@/components/PrescriptionNotice";

type Step = "coverage" | "slot" | "details" | "summary" | "done";
type Form = {
  fullName: string;
  dni: string;
  phone: string;
  email: string;
  birthDate: string;
  memberNumber: string;
  consentReminders: boolean;
  privacyAccepted: boolean;
};
const emptyForm: Form = { fullName: "", dni: "", phone: "", email: "", birthDate: "", memberNumber: "", consentReminders: false, privacyAccepted: false };

export function BookingWizard({
  config,
  initialCoverage,
  initialType,
  initialDate,
  otpChannels,
  emailRequired,
}: {
  config: PublicConfig;
  initialCoverage?: string;
  initialType?: string;
  initialDate?: string;
  otpChannels: { email: boolean; whatsapp: boolean };
  emailRequired: boolean;
}) {
  const preCov = config.coverages.find((c) => c.slug === initialCoverage);
  const preType = config.types.find((t) => t.slug === initialType && preCov?.typeIds.includes(t.id));
  const [coverageId, setCoverageId] = useState<number | null>(preCov?.id ?? null);
  const [typeId, setTypeId] = useState<number | null>(
    preType?.id ?? (preCov && preCov.typeIds.length === 1 ? preCov.typeIds[0] : null),
  );
  const [step, setStep] = useState<Step>(preCov && (preType || preCov.typeIds.length === 1) ? "slot" : "coverage");
  const [slot, setSlot] = useState<SerializedSlot | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<{ token: string; appointment: AppointmentView } | null>(null);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [covSearch, setCovSearch] = useState("");
  const honeypot = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const coverage = config.coverages.find((c) => c.id === coverageId) ?? null;
  const type = config.types.find((t) => t.id === typeId) ?? null;
  const typesForCov = coverage ? config.types.filter((t) => coverage.typeIds.includes(t.id)) : [];
  const location = config.locations.find((l) => l.id === slot?.locationId) ?? config.locations[0];

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  const stepIndex = step === "coverage" ? 0 : step === "slot" ? 1 : 2;
  const filteredCoverages = useMemo(() => {
    const q = covSearch.trim().toLowerCase();
    return q ? config.coverages.filter((c) => c.name.toLowerCase().includes(q)) : config.coverages;
  }, [covSearch, config.coverages]);

  function chooseCoverage(id: number) {
    setCoverageId(id);
    setSlot(null);
    const c = config.coverages.find((x) => x.id === id)!;
    if (c.typeIds.length === 1) {
      setTypeId(c.typeIds[0]);
      setStep("slot");
    } else if (!typeId || !c.typeIds.includes(typeId)) setTypeId(null);
  }

  function validate(): boolean {
    const e: Partial<Record<keyof Form, string>> = {};
    if (form.fullName.trim().length < 5 || !form.fullName.trim().includes(" ")) e.fullName = "Ingresá tu nombre y apellido.";
    if (!/^\d{7,8}$/.test(form.dni.replace(/[.\s-]/g, ""))) e.dni = "Ingresá tu DNI sin puntos (7 u 8 números).";
    if (form.phone.replace(/\D/g, "").length < 10) e.phone = "Ingresá tu celular con código de área (ej.: 11 2345-6789).";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) e.email = "Revisá el correo electrónico.";
    if (emailRequired && !form.email.trim()) e.email = "Ingresá tu correo para recibir la confirmación.";
    if (coverage?.requiresMemberNumber && !form.memberNumber.trim()) e.memberNumber = "Ingresá tu número de afiliada.";
    if (coverage?.requiresBirthDate && !form.birthDate) e.birthDate = "Ingresá tu fecha de nacimiento.";
    if (!form.privacyAccepted) e.privacyAccepted = "Necesitás aceptar la política de privacidad para reservar.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function confirm() {
    if (!slot || !coverage || !type) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await apiFetch<{ token: string; appointment: AppointmentView }>("/api/bookings", {
        body: {
          coverageId: coverage.id,
          consultationTypeId: type.id,
          locationId: slot.locationId,
          start: slot.start,
          ...form,
          verificationToken,
          website: honeypot.current?.value ?? "",
        },
      });
      setResult(r);
      setStep("done");
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "SLOT_TAKEN" || err.code === "SLOT_UNAVAILABLE") {
        setSlot(null);
        setSlotNotice(err.message);
        setReloadKey((k) => k + 1);
        setStep("slot");
      } else setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  if (step === "done" && result) return <Done result={result} prescription={config.prescription} />;

  return (
    <div ref={topRef} className="scroll-mt-24">
      {/* Progreso */}
      <ol className="mb-6 grid grid-cols-3 gap-2" aria-label="Pasos de la reserva">
        {["Cobertura", "Turno", "Tus datos"].map((label, i) => (
          <li key={label} aria-current={i === stepIndex ? "step" : undefined}>
            <div className={`h-1.5 rounded-full ${i <= stepIndex ? "bg-brand" : "bg-line"}`} />
            <p className={`mt-1.5 text-sm ${i === stepIndex ? "font-semibold text-ink" : "text-muted"}`}>
              {i + 1}. {label}
            </p>
          </li>
        ))}
      </ol>

      {step === "coverage" && (
        <section className="space-y-6">
          <div>
            <h1 className="font-display text-[26px] leading-tight font-extrabold text-accent">¿Con qué cobertura te atendés?</h1>
            <p className="mt-1 text-muted">Elegí tu prepaga u obra social, o “Particular”.</p>
          </div>
          {config.coverages.length > 8 && (
            <input className="input" placeholder="Buscar cobertura…" value={covSearch} onChange={(e) => setCovSearch(e.target.value)} aria-label="Buscar cobertura" />
          )}
          <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Cobertura">
            {filteredCoverages.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={coverageId === c.id}
                onClick={() => chooseCoverage(c.id)}
                className={`flex min-h-14 items-center justify-between rounded-2xl border px-4 py-3 text-left text-[17px] font-semibold transition ${
                  coverageId === c.id ? "border-brand bg-brand/5 ring-2 ring-brand/30" : "border-line bg-white hover:border-brand"
                }`}
              >
                {c.name}
                {coverageId === c.id && <CheckIcon className="h-5 w-5 text-brand" />}
              </button>
            ))}
          </div>
          {coverage?.instructions && <div className="alert-info">{coverage.instructions}</div>}
          {coverage && typesForCov.length > 1 && (
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">¿Qué tipo de consulta necesitás?</h2>
              <div className="grid gap-2.5" role="radiogroup" aria-label="Tipo de consulta">
                {typesForCov.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={typeId === t.id}
                    onClick={() => {
                      setTypeId(t.id);
                      setSlot(null);
                    }}
                    className={`rounded-2xl border px-4 py-3.5 text-left transition ${
                      typeId === t.id ? "border-brand bg-brand/5 ring-2 ring-brand/30" : "border-line bg-white hover:border-brand"
                    }`}
                  >
                    <span className="block text-[17px] font-semibold">{t.name}</span>
                    {t.description && <span className="text-[15px] text-muted">{t.description}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button type="button" className="btn-primary w-full" disabled={!coverage || !type} onClick={() => setStep("slot")}>
            Continuar
          </button>
        </section>
      )}

      {step === "slot" && coverage && type && (
        <section className="space-y-5">
          <BackButton onClick={() => setStep("coverage")} />
          <div>
            <h1 className="font-display text-[26px] leading-tight font-extrabold text-accent">Seleccioná tu turno</h1>
            <p className="mt-1 text-muted">
              {coverage.name} · {type.name}
            </p>
          </div>
          {config.opensLabel && <p className="alert-info">Los turnos se dan a partir del {config.opensLabel}.</p>}
          {slotNotice && (
            <div className="alert-error" role="alert">
              {slotNotice}
            </div>
          )}
          {showWaitlist ? (
            <WaitlistForm coverageId={coverage.id} typeId={type.id} onClose={() => setShowWaitlist(false)} />
          ) : (
            <SlotPicker
              query={`coverage=${coverage.id}&type=${type.id}`}
              selectedStart={slot?.start}
              initialDate={initialDate}
              reloadKey={reloadKey}
              onSelect={(s) => {
                setSlot(s);
                setSlotNotice(null);
                setStep("details");
              }}
              onNoneFit={config.waitlistEnabled ? () => setShowWaitlist(true) : undefined}
            />
          )}
        </section>
      )}

      {step === "details" && slot && coverage && type && (
        <section className="space-y-5">
          <BackButton onClick={() => setStep("slot")} />
          <div>
            <h1 className="font-display text-[26px] leading-tight font-extrabold text-accent">Completá tus datos</h1>
            <p className="mt-1 flex items-center gap-1.5 text-muted">
              <CalendarIcon className="h-4 w-4" /> {slot.dateLabel} · {slot.time} hs.
            </p>
          </div>
          {(otpChannels.email || otpChannels.whatsapp) && !verificationToken && (
            <RecoverData
              channels={otpChannels}
              onRecovered={(token, p) => {
                setVerificationToken(token);
                setForm((f) => ({
                  ...f,
                  fullName: p.fullName ?? f.fullName,
                  dni: p.dni ?? f.dni,
                  phone: p.phone ? p.phone.replace(/^549/, "") : f.phone,
                  email: p.email ?? f.email,
                  birthDate: p.birthDate ?? f.birthDate,
                  memberNumber: p.coverageSlug === coverage.slug ? (p.memberNumber ?? f.memberNumber) : f.memberNumber,
                }));
                setErrors({});
              }}
            />
          )}
          {verificationToken && <div className="alert-ok">¡Listo! Completamos tus datos. Revisalos antes de continuar.</div>}
          <form
            className="space-y-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (validate()) setStep("summary");
              else setTimeout(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(), 0);
            }}
          >
            <Field label="Nombre y apellido" error={errors.fullName}>
              <input className="input" autoComplete="name" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} aria-invalid={!!errors.fullName} />
            </Field>
            <Field label="DNI" error={errors.dni} hint="Sin puntos">
              <input className="input" inputMode="numeric" autoComplete="off" value={form.dni} onChange={(e) => set("dni", e.target.value)} aria-invalid={!!errors.dni} />
            </Field>
            <Field label="Celular con WhatsApp" error={errors.phone} hint="Con código de área, sin 0 ni 15. Ej.: 11 2345-6789">
              <input className="input" type="tel" inputMode="tel" autoComplete="tel-national" value={form.phone} onChange={(e) => set("phone", e.target.value)} aria-invalid={!!errors.phone} />
            </Field>
            <Field label={`Correo electrónico${emailRequired ? "" : " (opcional)"}`} error={errors.email}>
              <input className="input" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} aria-invalid={!!errors.email} />
            </Field>
            {coverage.requiresBirthDate && (
              <Field label="Fecha de nacimiento" error={errors.birthDate}>
                <input className="input" type="date" value={form.birthDate} onChange={(e) => set("birthDate", e.target.value)} aria-invalid={!!errors.birthDate} />
              </Field>
            )}
            {coverage.requiresMemberNumber && (
              <Field label={`Número de afiliada (${coverage.name})`} error={errors.memberNumber}>
                <input className="input" autoComplete="off" value={form.memberNumber} onChange={(e) => set("memberNumber", e.target.value)} aria-invalid={!!errors.memberNumber} />
              </Field>
            )}
            {/* Campo trampa para bots: invisible para personas */}
            <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
            <div className="space-y-3 rounded-2xl bg-soft p-4">
              <Check checked={form.consentReminders} onChange={(v) => set("consentReminders", v)}>
                Quiero recibir recordatorios de mi turno por WhatsApp o correo electrónico.
              </Check>
              <Check checked={form.privacyAccepted} onChange={(v) => set("privacyAccepted", v)} invalid={!!errors.privacyAccepted}>
                Leí y acepto la{" "}
                <Link href="/privacidad" target="_blank" className="font-semibold text-brand underline">
                  política de privacidad
                </Link>
                .
              </Check>
              {errors.privacyAccepted && <p className="field-error">{errors.privacyAccepted}</p>}
            </div>
            <button type="submit" className="btn-primary w-full">
              Continuar
            </button>
          </form>
        </section>
      )}

      {step === "summary" && slot && coverage && type && (
        <section className="space-y-5">
          <BackButton onClick={() => setStep("details")} />
          <h1 className="font-display text-[26px] leading-tight font-extrabold text-accent">Revisá y confirmá</h1>
          <div className="card space-y-4">
            <Row icon={<UserIcon />} label="Profesional" value={config.professionalName} sub={config.specialty} />
            <Row icon={<CalendarIcon />} label="Fecha" value={slot.dateLabel} />
            <Row icon={<ClockIcon />} label="Hora" value={`${slot.time} hs.`} />
            <Row icon={<PinIcon />} label="Dirección" value={location?.address ?? ""} sub={config.locations.length > 1 ? location?.name : undefined} />
            <Row icon={<CardIcon />} label="Cobertura" value={coverage.name} sub={form.memberNumber ? `Afiliada N° ${form.memberNumber}` : undefined} />
            <Row icon={<ShieldIcon />} label="Tipo de consulta" value={type.name} />
            <p className="border-t border-line pt-3 text-[15px] text-muted">
              A nombre de <strong className="text-ink">{form.fullName}</strong>
            </p>
          </div>
          {submitError && (
            <div className="alert-error" role="alert">
              {submitError}
            </div>
          )}
          <button type="button" className="btn-primary w-full text-lg" onClick={confirm} disabled={submitting}>
            {submitting ? "Confirmando…" : "Confirmar mi turno"}
          </button>
        </section>
      )}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-[15px] font-semibold text-muted hover:text-ink">
      <ChevronLeft className="h-5 w-5" /> Volver
    </button>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactElement }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="hint block">{hint}</span>}
      {error && (
        <span className="field-error block" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

function Check({ checked, onChange, children, invalid }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; invalid?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-[15px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-invalid={invalid}
        className="mt-0.5 h-6 w-6 shrink-0 rounded-md border-line accent-[var(--color-brand)]"
      />
      <span>{children}</span>
    </label>
  );
}

function Row({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-brand">{icon}</span>
      <div>
        <p className="text-sm text-muted">{label}</p>
        <p className="font-semibold">{value}</p>
        {sub && <p className="text-[15px] text-muted">{sub}</p>}
      </div>
    </div>
  );
}

type Recovered = { fullName: string; dni: string; phone: string; email: string | null; birthDate: string | null; memberNumber: string | null; coverageSlug: string | null };

function RecoverData({ channels, onRecovered }: { channels: { email: boolean; whatsapp: boolean }; onRecovered: (token: string, p: Recovered) => void }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"email" | "whatsapp">(channels.whatsapp ? "whatsapp" : "email");
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-full rounded-2xl border border-dashed border-brand/40 bg-brand/5 px-4 py-3 text-left">
        <span className="block font-semibold text-brand">¿Ya te atendiste antes?</span>
        <span className="text-[15px] text-muted">Recuperá tus datos con un código y no los cargues de nuevo.</span>
      </button>
    );

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/otp/request", { body: { channel, value } });
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ verificationToken: string; patient: Recovered }>("/api/otp/verify", { body: { channel, value, code } });
      onRecovered(r.verificationToken, r.patient);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <p className="font-semibold">Recuperar mis datos</p>
      {channels.email && channels.whatsapp && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {(["whatsapp", "email"] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={channel === c}
              onClick={() => {
                setChannel(c);
                setSent(false);
                setValue("");
              }}
              className={`min-h-11 rounded-xl border text-[15px] font-semibold ${channel === c ? "border-brand bg-brand/5 text-brand" : "border-line"}`}
            >
              {c === "whatsapp" ? "Por WhatsApp" : "Por correo"}
            </button>
          ))}
        </div>
      )}
      {!sent ? (
        <>
          <label className="block">
            <span className="label">{channel === "whatsapp" ? "Tu celular registrado" : "Tu correo registrado"}</span>
            <input
              className="input"
              type={channel === "email" ? "email" : "tel"}
              inputMode={channel === "email" ? "email" : "tel"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <button type="button" className="btn-secondary w-full" disabled={busy || value.length < 5} onClick={send}>
            {busy ? "Enviando…" : "Enviarme un código"}
          </button>
        </>
      ) : (
        <>
          <p className="text-[15px] text-muted">Si tus datos están registrados, te enviamos un código de 6 números. Puede tardar un minuto.</p>
          <label className="block">
            <span className="label">Código</span>
            <input
              className="input text-center text-2xl tracking-[0.4em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <button type="button" className="btn-primary w-full" disabled={busy || code.length !== 6} onClick={verify}>
            {busy ? "Verificando…" : "Verificar"}
          </button>
          <button type="button" className="btn-ghost w-full" onClick={() => setSent(false)}>
            Usar otro dato
          </button>
        </>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

function googleCalendarUrl(a: AppointmentView) {
  const f = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `Turno con ${a.professional}`,
    dates: `${f(a.startIso)}/${f(a.endIso)}`,
    location: a.address,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

function Done({ result, prescription }: { result: { token: string; appointment: AppointmentView }; prescription: PublicConfig["prescription"] }) {
  const a = result.appointment;
  return (
    <section className="space-y-6 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand text-on-brand">
        <CheckIcon className="h-10 w-10" />
      </div>
      <div>
        <h1 className="font-display text-[28px] leading-tight font-extrabold text-accent">¡Tu turno está confirmado!</h1>
        <p className="mt-2 text-lg text-muted">Te enviaremos recordatorios para que no te olvides.</p>
      </div>
      <div className="card space-y-3 text-left">
        <Row icon={<CalendarIcon />} label="Fecha" value={a.dateLabel} />
        <Row icon={<ClockIcon />} label="Hora" value={`${a.time} hs.`} />
        <Row icon={<PinIcon />} label="Dirección" value={a.address} />
        <Row icon={<UserIcon />} label="Profesional" value={a.professional} />
      </div>
      {a.instructions && <div className="alert-info text-left">{a.instructions}</div>}
      <div className="grid gap-3">
        <a className="btn-secondary" href={googleCalendarUrl(a)} target="_blank" rel="noopener noreferrer">
          <CalendarIcon /> Agregar a mi calendario
        </a>
        <Link className="btn-ghost" href={`/t/${result.token}`}>
          Ver, reprogramar o cancelar mi turno
        </Link>
      </div>
      <p className="text-[15px] text-muted">También te enviamos este enlace para que puedas gestionar tu turno cuando lo necesites.</p>
      <PrescriptionNotice prescription={prescription} />
    </section>
  );
}
