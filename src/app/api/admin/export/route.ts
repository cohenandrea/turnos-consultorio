import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, consultationTypes, coverages, patients } from "@/db/schema";
import { getAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/services/config";
import { formatShort } from "@/lib/time";

function csv(rows: (string | number | null | undefined)[][]) {
  return "﻿" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
}

/** Exportación para respaldo propio (solo perfil profesional). */
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin || admin.role !== "owner") return new Response("No autorizado", { status: 401 });
  const tipo = new URL(req.url).searchParams.get("tipo");
  const s = await getSettings();
  let body: string;
  if (tipo === "turnos") {
    const rows = await db
      .select({ a: appointments, dni: patients.dni, cov: coverages.name, type: consultationTypes.name })
      .from(appointments)
      .innerJoin(patients, eq(patients.id, appointments.patientId))
      .innerJoin(coverages, eq(coverages.id, appointments.coverageId))
      .innerJoin(consultationTypes, eq(consultationTypes.id, appointments.consultationTypeId))
      .orderBy(asc(appointments.startAt));
    body = csv([
      ["Fecha", "Paciente", "DNI", "Celular", "Correo", "Cobertura", "N° afiliada", "Tipo", "Estado"],
      ...rows.map(({ a, dni, cov, type }) => [formatShort(a.startAt, s.timezone), a.contactName, dni, a.contactPhone, a.contactEmail, cov, a.memberNumber, type, a.status]),
    ]);
  } else {
    const rows = await db.select({ p: patients, cov: coverages.name }).from(patients).leftJoin(coverages, eq(coverages.id, patients.coverageId)).orderBy(asc(patients.fullName));
    body = csv([
      ["Nombre", "DNI", "Celular", "Correo", "Cobertura", "N° afiliada", "Recordatorios", "Alta"],
      ...rows.map(({ p, cov }) => [p.fullName, p.dni, p.phone, p.email, cov, p.memberNumber, p.consentReminders ? "Sí" : "No", formatShort(p.createdAt, s.timezone)]),
    ]);
  }
  await audit({ type: "admin", id: admin.id }, "export", tipo ?? "pacientes");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${tipo === "turnos" ? "turnos" : "pacientes"}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
