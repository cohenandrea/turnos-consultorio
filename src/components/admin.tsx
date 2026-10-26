import Link from "next/link";
import { SubmitButton } from "./SubmitButton";
export { SubmitButton };

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[26px] leading-tight font-extrabold text-accent">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  if (!ok && !error) return null;
  return (
    <div className={`mb-5 ${error ? "alert-error" : "alert-ok"}`} role={error ? "alert" : "status"}>
      {error ?? ok}
    </div>
  );
}

const STATUS: Record<string, [string, string]> = {
  confirmed: ["Confirmado", "bg-[#e8f3ec] text-ok"],
  cancelled: ["Cancelado", "bg-[#fbeceb] text-danger"],
  completed: ["Atendido", "bg-soft text-muted"],
  no_show: ["Ausente", "bg-[#fff3df] text-[#8a5a00]"],
  pending: ["Pendiente", "bg-soft text-muted"],
  sending: ["Enviando", "bg-soft text-muted"],
  sent: ["Enviado", "bg-[#e8f3ec] text-ok"],
  delivered: ["Entregado", "bg-[#e8f3ec] text-ok"],
  read: ["Leído", "bg-[#e8f3ec] text-ok"],
  failed: ["Falló", "bg-[#fbeceb] text-danger"],
  skipped: ["Omitido", "bg-soft text-muted"],
  synced: ["Sincronizado", "bg-[#e8f3ec] text-ok"],
  error: ["Error", "bg-[#fbeceb] text-danger"],
  not_connected: ["Sin conexión", "bg-soft text-muted"],
  active: ["Activa", "bg-[#e8f3ec] text-ok"],
  notified: ["Avisada", "bg-[#fff3df] text-[#8a5a00]"],
  booked: ["Reservó", "bg-soft text-muted"],
  removed: ["Baja", "bg-soft text-muted"],
};

export function Badge({ status, label }: { status: string; label?: string }) {
  const [text, cls] = STATUS[status] ?? [status, "bg-soft text-muted"];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${cls}`}>{label ?? text}</span>;
}

export function Stat({ label, value, href, tone }: { label: string; value: number | string; href?: string; tone?: "warn" }) {
  const inner = (
    <div className={`rounded-2xl border bg-white p-4 ${tone === "warn" ? "border-danger/40" : "border-line"}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${tone === "warn" ? "text-danger" : ""}`}>{value}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition hover:-translate-y-0.5">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function Section({ title, children, actions, description }: { title: string; children: React.ReactNode; actions?: React.ReactNode; description?: string }) {
  return (
    <section className="card mb-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function F({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="label text-sm">{label}</span>
      {children}
      {hint && <span className="hint block text-xs">{hint}</span>}
    </label>
  );
}

export function Toggle({ name, defaultChecked, label }: { name: string; defaultChecked?: boolean; label: string }) {
  return (
    <label className="flex items-center gap-2.5 text-[15px]">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-5 w-5 accent-[var(--color-brand)]" />
      {label}
    </label>
  );
}

export const th = "px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-muted uppercase";
export const td = "px-3 py-3 align-top text-[15px]";
