import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { consultationTypes, coverages, locations, settings, scheduleRules, type Coverage, type ConsultationType } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { DateTime } from "luxon";
import { WEEKDAYS } from "@/lib/time";

export async function getSettings() {
  const [s] = await db.select().from(settings).where(eq(settings.id, 1));
  if (!s) throw new Error("La base de datos no está inicializada. Ejecutá `npm run db:migrate`.");
  return s;
}

export async function getActiveLocations() {
  return db.select().from(locations).where(eq(locations.active, true)).orderBy(asc(locations.sortOrder), asc(locations.id));
}

export async function getActiveRules() {
  return db.select().from(scheduleRules).where(eq(scheduleRules.active, true));
}

export async function getActiveCoverages() {
  return db.select().from(coverages).where(eq(coverages.active, true)).orderBy(asc(coverages.sortOrder), asc(coverages.name));
}

export async function getActiveTypes() {
  return db
    .select()
    .from(consultationTypes)
    .where(eq(consultationTypes.active, true))
    .orderBy(asc(consultationTypes.sortOrder), asc(consultationTypes.id));
}

/** Tipos de consulta permitidos para una cobertura. */
export function typesForCoverage(coverage: Coverage, types: ConsultationType[]) {
  return coverage.allowedConsultationTypeIds.length
    ? types.filter((t) => coverage.allowedConsultationTypeIds.includes(t.id))
    : types;
}

export function durationFor(coverage: Coverage, type: ConsultationType) {
  return coverage.durationOverrideMinutes ?? type.durationMinutes;
}

/** Valida cobertura + tipo de consulta (activos y compatibles). */
export async function resolveCoverageAndType(coverageId: number, consultationTypeId: number) {
  const [coverage] = await db.select().from(coverages).where(eq(coverages.id, coverageId));
  const [type] = await db.select().from(consultationTypes).where(eq(consultationTypes.id, consultationTypeId));
  if (!coverage || !coverage.active) throw new AppError("INVALID_INPUT", "La cobertura seleccionada no está disponible.");
  if (!type || !type.active) throw new AppError("INVALID_INPUT", "El tipo de consulta no está disponible.");
  if (coverage.allowedConsultationTypeIds.length && !coverage.allowedConsultationTypeIds.includes(type.id)) {
    throw new AppError("INVALID_INPUT", "Ese tipo de consulta no está habilitado para tu cobertura.");
  }
  return { coverage, type };
}

/** Datos públicos para la página de pacientes (sin nada sensible). */
export async function getPublicConfig() {
  const [s, locs, covs, types, rules] = await Promise.all([getSettings(), getActiveLocations(), getActiveCoverages(), getActiveTypes(), getActiveRules()]);
  const hoursFor = (locationId: number) =>
    rules
      .filter((r) => r.locationId === locationId)
      .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
      .map((r) => ({ day: WEEKDAYS[r.weekday - 1], from: r.startTime, to: r.endTime }));
  return {
    professionalName: s.professionalName,
    specialty: s.specialty,
    bio: s.bio,
    photoUrl: s.photoUrl,
    attentionInfo: s.attentionInfo,
    whatsappContact: s.whatsappContact,
    contactEmail: s.contactEmail,
    primaryColor: s.primaryColor,
    accentColor: s.accentColor,
    timezone: s.timezone,
    waitlistEnabled: s.waitlistEnabled,
    cancelLimitHours: s.cancelLimitHours,
    opensLabel:
      s.bookingStartDate && DateTime.fromISO(s.bookingStartDate, { zone: s.timezone }) > DateTime.now()
        ? DateTime.fromISO(s.bookingStartDate, { zone: s.timezone }).setLocale("es-AR").toFormat("d 'de' LLLL 'de' yyyy")
        : null,
    prescription: s.prescriptionUrl ? { url: s.prescriptionUrl, note: s.prescriptionNote } : null,
    locations: locs.map((l) => ({ id: l.id, name: l.name, address: l.address, mapsUrl: l.mapsUrl, notes: l.notes, hours: hoursFor(l.id) })),
    coverages: covs.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      kind: c.kind,
      requiresMemberNumber: c.requiresMemberNumber,
      requiresBirthDate: c.requiresBirthDate,
      instructions: c.instructions,
      typeIds: typesForCoverage(c, types).map((t) => t.id),
    })),
    types: types.map((t) => ({ id: t.id, slug: t.slug, name: t.name, description: t.description, durationMinutes: t.durationMinutes })),
  };
}

export type PublicConfig = Awaited<ReturnType<typeof getPublicConfig>>;
