import { eq } from "drizzle-orm";
import { db } from "@/db";
import { consultationTypes, coverages, locations, type Appointment } from "@/db/schema";
import { formatDateLongCap, formatTime } from "@/lib/time";
import { getSettings } from "./config";

/** Datos de un turno para mostrar a la paciente (sin DNI ni teléfono). */
export async function appointmentView(appt: Appointment) {
  const s = await getSettings();
  const [[loc], [cov], [type]] = await Promise.all([
    db.select().from(locations).where(eq(locations.id, appt.locationId)),
    db.select().from(coverages).where(eq(coverages.id, appt.coverageId)),
    db.select().from(consultationTypes).where(eq(consultationTypes.id, appt.consultationTypeId)),
  ]);
  const hoursLeft = (appt.startAt.getTime() - Date.now()) / 3600_000;
  return {
    status: appt.status,
    isPast: appt.endAt.getTime() < Date.now(),
    firstName: appt.contactName.split(" ")[0],
    professional: s.professionalName,
    specialty: s.specialty,
    dateLabel: formatDateLongCap(appt.startAt, s.timezone),
    time: formatTime(appt.startAt, s.timezone),
    startIso: appt.startAt.toISOString(),
    endIso: appt.endAt.toISOString(),
    address: loc?.address ?? "",
    locationName: loc?.name ?? "",
    mapsUrl: loc?.mapsUrl ?? null,
    coverageName: cov?.name ?? "",
    coverageId: appt.coverageId,
    typeName: type?.name ?? "",
    typeId: appt.consultationTypeId,
    instructions: cov?.instructions ?? null,
    attendanceConfirmed: !!appt.attendanceConfirmedAt,
    canCancel: appt.status === "confirmed" && hoursLeft >= s.cancelLimitHours,
    canReschedule: appt.status === "confirmed" && hoursLeft >= s.rescheduleLimitHours,
    cancelLimitHours: s.cancelLimitHours,
    rescheduleLimitHours: s.rescheduleLimitHours,
    whatsappContact: s.whatsappContact,
  };
}
export type AppointmentView = Awaited<ReturnType<typeof appointmentView>>;
