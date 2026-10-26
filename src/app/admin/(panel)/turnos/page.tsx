import Link from "next/link";
import { and, eq, gt, lt } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import { scheduleExceptions } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { listAppointments } from "@/lib/services/admin-queries";
import { getActiveCoverages, getSettings } from "@/lib/services/config";
import { ApptTable } from "@/components/ApptTable";
import { F, Flash, PageHeader, Section } from "@/components/admin";
import { WeekCalendar } from "./WeekCalendar";

export default async function Turnos({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const s = await getSettings();
  const covs = await getActiveCoverages();
  const view = sp.vista === "semana" ? "semana" : "lista";
  const tz = s.timezone;

  const header = (
    <PageHeader
      title="Turnos"
      actions={
        <>
          <div className="inline-flex rounded-2xl border border-line bg-white p-1">
            {[
              ["lista", "Lista"],
              ["semana", "Calendario"],
            ].map(([v, l]) => (
              <Link key={v} href={`/admin/turnos?vista=${v}`} className={`rounded-xl px-4 py-2 text-sm font-semibold ${view === v ? "bg-brand text-on-brand" : ""}`}>
                {l}
              </Link>
            ))}
          </div>
          <Link href="/admin/turnos/nuevo" className="btn-primary">
            Nuevo turno
          </Link>
        </>
      }
    />
  );

  if (view === "semana") {
    const base = sp.semana ? DateTime.fromISO(sp.semana, { zone: tz }) : DateTime.now().setZone(tz);
    const weekStart = base.startOf("week");
    const weekEnd = weekStart.plus({ days: 7 });
    const [rows, blocks] = await Promise.all([
      listAppointments({ from: weekStart.toJSDate(), to: weekEnd.toJSDate() }),
      db
        .select()
        .from(scheduleExceptions)
        .where(and(lt(scheduleExceptions.startAt, weekEnd.toJSDate()), gt(scheduleExceptions.endAt, weekStart.toJSDate()))),
    ]);
    return (
      <>
        {header}
        <Flash sp={sp} />
        <div className="mb-4 flex items-center gap-2">
          <Link className="btn-secondary min-h-10 px-3" href={`/admin/turnos?vista=semana&semana=${weekStart.minus({ days: 7 }).toISODate()}`}>
            ← Anterior
          </Link>
          <Link className="btn-secondary min-h-10 px-3" href="/admin/turnos?vista=semana">
            Hoy
          </Link>
          <Link className="btn-secondary min-h-10 px-3" href={`/admin/turnos?vista=semana&semana=${weekStart.plus({ days: 7 }).toISODate()}`}>
            Siguiente →
          </Link>
          <span className="ml-2 font-semibold">
            {weekStart.setLocale("es-AR").toFormat("d LLL")} – {weekEnd.minus({ days: 1 }).setLocale("es-AR").toFormat("d LLL yyyy")}
          </span>
        </div>
        <WeekCalendar
          tz={tz}
          weekStart={weekStart.toISODate()!}
          appointments={rows
            .filter((r) => r.a.status !== "cancelled")
            .map((r) => ({ id: r.a.id, start: r.a.startAt.toISOString(), end: r.a.endAt.toISOString(), name: r.a.contactName, coverage: r.coverage, status: r.a.status, review: r.a.needsReview }))}
          blocks={blocks.filter((b) => b.kind !== "extra").map((b) => ({ start: b.startAt.toISOString(), end: b.endAt.toISOString(), title: b.title }))}
        />
      </>
    );
  }

  const from = sp.desde ? DateTime.fromISO(sp.desde, { zone: tz }).startOf("day") : DateTime.now().setZone(tz).startOf("day");
  const to = sp.hasta ? DateTime.fromISO(sp.hasta, { zone: tz }).endOf("day") : null;
  const rows = await listAppointments({
    from: sp.q ? undefined : from.toJSDate(),
    to: to?.toJSDate(),
    coverageId: sp.cobertura ? Number(sp.cobertura) : undefined,
    status: sp.status || (sp.q ? undefined : "confirmed"),
    q: sp.q,
    order: sp.q ? "desc" : "asc",
  });
  return (
    <>
      {header}
      <Flash sp={sp} />
      <form className="card mb-6 grid grid-cols-2 gap-3 md:grid-cols-6" method="get">
        <F label="Buscar paciente" className="col-span-2">
          <input className="input" name="q" defaultValue={sp.q} placeholder="Nombre, DNI, teléfono o correo" />
        </F>
        <F label="Desde">
          <input className="input" type="date" name="desde" defaultValue={sp.desde ?? from.toISODate()!} />
        </F>
        <F label="Hasta">
          <input className="input" type="date" name="hasta" defaultValue={sp.hasta} />
        </F>
        <F label="Cobertura">
          <select className="input" name="cobertura" defaultValue={sp.cobertura ?? ""}>
            <option value="">Todas</option>
            {covs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </F>
        <F label="Estado">
          <select className="input" name="status" defaultValue={sp.status ?? ""}>
            <option value="">Confirmados</option>
            <option value="cancelled">Cancelados</option>
            <option value="completed">Atendidos</option>
            <option value="no_show">Ausentes</option>
          </select>
        </F>
        <div className="col-span-2 flex gap-2 md:col-span-6">
          <button className="btn-primary min-h-10">Filtrar</button>
          <Link href="/admin/turnos" className="btn-ghost min-h-10">
            Limpiar
          </Link>
        </div>
      </form>
      <Section title={`${rows.length} turno${rows.length === 1 ? "" : "s"}`}>
        <ApptTable rows={rows} tz={tz} />
      </Section>
    </>
  );
}
