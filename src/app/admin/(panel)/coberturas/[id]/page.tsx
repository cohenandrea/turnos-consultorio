import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { coverages, type Coverage } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { getActiveLocations, getActiveTypes } from "@/lib/services/config";
import { WEEKDAYS } from "@/lib/time";
import { F, Flash, PageHeader, Section, SubmitButton, Toggle } from "@/components/admin";
import { CopyButton } from "@/components/CopyButton";
import { saveCoverage } from "../../../actions/config";

export default async function CoberturaEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireAdmin("owner");
  const { id } = await params;
  const sp = await searchParams;
  let c: Coverage | null = null;
  if (id !== "nueva") {
    [c] = await db.select().from(coverages).where(eq(coverages.id, Number(id)));
    if (!c) notFound();
  }
  const [types, locs] = await Promise.all([getActiveTypes(), getActiveLocations()]);
  const link = c ? `${env.appUrl()}/reservar?cobertura=${c.slug}` : null;
  const checks = (name: string, items: { id: number; label: string }[], selected: number[]) => (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <label key={i.id} className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm">
          <input type="checkbox" name={name} value={i.id} defaultChecked={selected.includes(i.id)} className="accent-[var(--color-brand)]" /> {i.label}
        </label>
      ))}
    </div>
  );
  return (
    <>
      <PageHeader title={c ? c.name : "Nueva cobertura"} actions={<Link href="/admin/coberturas" className="btn-ghost">← Coberturas</Link>} />
      <Flash sp={sp} />
      {link && (
        <div className="card mb-6 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Enlace de reserva con esta cobertura preseleccionada</p>
            <p className="font-mono text-sm break-all text-muted">{link}</p>
          </div>
          <CopyButton text={link} />
          <Link className="btn-secondary min-h-10 px-3 text-sm" href={`/admin/compartir#${c!.slug}`}>Código QR</Link>
        </div>
      )}
      <form action={saveCoverage}>
        <input type="hidden" name="id" value={c?.id ?? ""} />
        <Section title="Datos">
          <div className="grid gap-4 md:grid-cols-2">
            <F label="Nombre visible"><input className="input" name="name" defaultValue={c?.name} required /></F>
            <F label="Identificador para el enlace" hint="Solo letras, números y guiones. Ej.: osde"><input className="input" name="slug" defaultValue={c?.slug} /></F>
            <F label="Tipo">
              <select className="input" name="kind" defaultValue={c?.kind ?? "prepaga"}>
                <option value="prepaga">Prepaga</option>
                <option value="obra_social">Obra social</option>
                <option value="particular">Particular</option>
                <option value="otra">Otra</option>
              </select>
            </F>
            <F label="Orden en la lista"><input className="input" type="number" name="sortOrder" defaultValue={c?.sortOrder ?? 50} /></F>
            <div className="space-y-2 md:col-span-2">
              <Toggle name="active" defaultChecked={c?.active ?? true} label="Activa (visible para las pacientes)" />
              <Toggle name="requiresMemberNumber" defaultChecked={c?.requiresMemberNumber ?? true} label="Pedir número de afiliada" />
              <Toggle name="requiresBirthDate" defaultChecked={c?.requiresBirthDate ?? false} label="Pedir fecha de nacimiento" />
            </div>
            <F label="Instrucciones o documentación necesaria" className="md:col-span-2" hint="Se muestran al elegir la cobertura y en la confirmación. Ej.: “Traé la orden y tu credencial”.">
              <textarea className="input min-h-20" name="instructions" defaultValue={c?.instructions ?? ""} />
            </F>
          </div>
        </Section>
        <Section title="Reglas específicas" description="Dejá todo sin marcar para no limitar.">
          <div className="space-y-5">
            <F label="Tipos de consulta permitidos">{checks("allowedConsultationTypeIds", types.map((t) => ({ id: t.id, label: t.name })), c?.allowedConsultationTypeIds ?? [])}</F>
            <F label="Días permitidos">{checks("allowedWeekdays", WEEKDAYS.map((d, i) => ({ id: i + 1, label: d })), c?.allowedWeekdays ?? [])}</F>
            {locs.length > 1 && <F label="Sedes habilitadas">{checks("allowedLocationIds", locs.map((l) => ({ id: l.id, label: l.name })), c?.allowedLocationIds ?? [])}</F>}
            <div className="grid gap-4 sm:grid-cols-3">
              <F label="Solo desde (hora)"><input className="input" type="time" name="timeFrom" defaultValue={c?.timeFrom ?? ""} /></F>
              <F label="Solo hasta (hora)"><input className="input" type="time" name="timeTo" defaultValue={c?.timeTo ?? ""} /></F>
              <F label="Duración especial (min)" hint="Vacío = la del tipo de consulta"><input className="input" type="number" name="durationOverrideMinutes" min={5} defaultValue={c?.durationOverrideMinutes ?? ""} /></F>
            </div>
          </div>
        </Section>
        <SubmitButton className="btn-primary">Guardar cobertura</SubmitButton>
      </form>
    </>
  );
}
