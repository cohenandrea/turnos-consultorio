import { and, asc, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import { appointments, consultationTypes, coverages, locations, patients } from "@/db/schema";

export type ApptFilters = {
  from?: Date;
  to?: Date;
  coverageId?: number;
  status?: string;
  q?: string;
  needsReview?: boolean;
  patientId?: string;
  limit?: number;
  order?: "asc" | "desc";
};

export async function listAppointments(f: ApptFilters) {
  const conds: (SQL | undefined)[] = [
    f.from ? gte(appointments.startAt, f.from) : undefined,
    f.to ? lt(appointments.startAt, f.to) : undefined,
    f.coverageId ? eq(appointments.coverageId, f.coverageId) : undefined,
    f.status ? eq(appointments.status, f.status) : undefined,
    f.needsReview ? eq(appointments.needsReview, true) : undefined,
    f.patientId ? eq(appointments.patientId, f.patientId) : undefined,
  ];
  if (f.q) {
    const q = `%${f.q.trim()}%`;
    conds.push(or(ilike(appointments.contactName, q), ilike(patients.dni, q), ilike(appointments.contactPhone, q), ilike(appointments.contactEmail, q)));
  }
  return db
    .select({
      a: appointments,
      dni: patients.dni,
      coverage: coverages.name,
      type: consultationTypes.name,
      location: locations.name,
    })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .innerJoin(coverages, eq(coverages.id, appointments.coverageId))
    .innerJoin(consultationTypes, eq(consultationTypes.id, appointments.consultationTypeId))
    .innerJoin(locations, eq(locations.id, appointments.locationId))
    .where(and(...conds))
    .orderBy(f.order === "desc" ? desc(appointments.startAt) : asc(appointments.startAt))
    .limit(f.limit ?? 300);
}
export type ApptRow = Awaited<ReturnType<typeof listAppointments>>[number];

export function dayRange(tz: string, offsetDays = 0) {
  const d = DateTime.now().setZone(tz).startOf("day").plus({ days: offsetDays });
  return { from: d.toJSDate(), to: d.plus({ days: 1 }).toJSDate(), label: d.setLocale("es-AR").toFormat("cccc d 'de' LLLL") };
}

export const countSql = sql<number>`count(*)::int`;
