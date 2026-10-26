"use server";

import { and, eq, gte } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import {
  adminUsers,
  consultationTypes,
  coverages,
  googleIntegration,
  locations,
  messageTemplates,
  patients,
  scheduleExceptions,
  scheduleRules,
  settings,
  waitlist,
} from "@/db/schema";
import { checkPassword, hashPassword, requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { bool, ids, num, runAction, str } from "@/lib/admin-action";
import { AppError } from "@/lib/errors";
import { clearBusyCache } from "@/lib/google/sync";
import { listCalendars } from "@/lib/google/api";
import { processOutbox } from "@/lib/messaging/outbox";
import { sendEmail } from "@/lib/messaging/email";
import { sendWhatsAppTemplate } from "@/lib/messaging/whatsapp";
import { normalizePhone } from "@/lib/phone";
import { getSettings } from "@/lib/services/config";
import { parseHHmm } from "@/lib/time";
import { runScheduledJobs } from "@/lib/services/jobs";

const HHMM = (v: string, label: string) => {
  try {
    parseHHmm(v);
    return v;
  } catch {
    throw new AppError("INVALID_INPUT", `${label}: usá el formato HH:MM.`);
  }
};
const intIn = (v: number, min: number, max: number, label: string) => {
  if (!Number.isInteger(v) || v < min || v > max) throw new AppError("INVALID_INPUT", `${label}: ingresá un número entre ${min} y ${max}.`);
  return v;
};
const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function owner() {
  return requireAdmin("owner");
}
async function logChange(adminId: string, action: string, entity: string, id?: string | number | null) {
  await audit({ type: "admin", id: adminId }, action, entity, id);
  clearBusyCache();
}

// ---------------- Agenda ----------------

export async function saveBookingRules(f: FormData) {
  const a = await owner();
  await runAction("/admin/agenda", async () => {
    await db
      .update(settings)
      .set({
        slotIntervalMinutes: intIn(num(f, "slotIntervalMinutes"), 5, 240, "Intervalo entre turnos"),
        bufferMinutes: intIn(num(f, "bufferMinutes"), 0, 120, "Tiempo entre pacientes"),
        minNoticeHours: intIn(num(f, "minNoticeHours"), 0, 720, "Anticipación mínima"),
        maxAdvanceDays: intIn(num(f, "maxAdvanceDays"), 1, 365, "Máximo a futuro"),
        cancelLimitHours: intIn(num(f, "cancelLimitHours"), 0, 720, "Límite para cancelar"),
        rescheduleLimitHours: intIn(num(f, "rescheduleLimitHours"), 0, 720, "Límite para reprogramar"),
        maxActivePerPatient: intIn(num(f, "maxActivePerPatient"), 0, 10, "Turnos activos por paciente"),
        bookingStartDate: /^\d{4}-\d{2}-\d{2}$/.test(str(f, "bookingStartDate")) ? str(f, "bookingStartDate") : null,
        updatedAt: new Date(),
      })
      .where(eq(settings.id, 1));
    await logChange(a.id, "settings.booking_rules", "settings", 1);
  });
}

export async function addRule(f: FormData) {
  const a = await owner();
  await runAction("/admin/agenda", async () => {
    const start = HHMM(str(f, "startTime"), "Desde");
    const end = HHMM(str(f, "endTime"), "Hasta");
    if (end <= start) throw new AppError("INVALID_INPUT", "La hora de fin debe ser posterior a la de inicio.");
    const days = ids(f, "weekday");
    if (!days.length) throw new AppError("INVALID_INPUT", "Elegí al menos un día.");
    await db.insert(scheduleRules).values(days.map((weekday) => ({ weekday, startTime: start, endTime: end, locationId: num(f, "locationId") })));
    await logChange(a.id, "schedule.rule_added", "schedule_rule");
    return "Franja agregada";
  });
}

export async function deleteRule(f: FormData) {
  const a = await owner();
  await runAction("/admin/agenda", async () => {
    await db.delete(scheduleRules).where(eq(scheduleRules.id, num(f, "id")));
    await logChange(a.id, "schedule.rule_deleted", "schedule_rule", num(f, "id"));
    return "Franja eliminada";
  });
}

export async function saveLocation(f: FormData) {
  const a = await owner();
  await runAction("/admin/agenda", async () => {
    const values = {
      name: str(f, "name"),
      address: str(f, "address"),
      mapsUrl: str(f, "mapsUrl") || null,
      notes: str(f, "notes") || null,
      active: bool(f, "active"),
    };
    if (!values.name || !values.address) throw new AppError("INVALID_INPUT", "Completá nombre y dirección.");
    if (values.mapsUrl && !/^https:\/\//.test(values.mapsUrl)) throw new AppError("INVALID_INPUT", "El enlace al mapa debe empezar con https://");
    const id = num(f, "id");
    if (id) await db.update(locations).set(values).where(eq(locations.id, id));
    else await db.insert(locations).values(values);
    await logChange(a.id, "location.saved", "location", id || null);
    return "Sede guardada";
  });
}

export async function saveType(f: FormData) {
  const a = await owner();
  await runAction("/admin/agenda", async () => {
    const name = str(f, "name");
    if (!name) throw new AppError("INVALID_INPUT", "Ingresá el nombre del tipo de consulta.");
    const values = {
      name,
      description: str(f, "description") || null,
      durationMinutes: intIn(num(f, "durationMinutes"), 5, 480, "Duración"),
      active: bool(f, "active"),
      sortOrder: num(f, "sortOrder") || 0,
    };
    const id = num(f, "id");
    if (id) await db.update(consultationTypes).set(values).where(eq(consultationTypes.id, id));
    else await db.insert(consultationTypes).values({ ...values, slug: slugify(name) || `tipo-${Date.now()}` });
    await logChange(a.id, "consultation_type.saved", "consultation_type", id || null);
    return "Tipo de consulta guardado";
  });
}

// ---------------- Bloqueos ----------------

export async function addException(f: FormData) {
  const a = await requireAdmin();
  await runAction("/admin/bloqueos", async () => {
    const s = await getSettings();
    const kind = str(f, "kind");
    if (!["block", "holiday", "vacation", "extra"].includes(kind)) throw new AppError("INVALID_INPUT", "Tipo inválido.");
    const fromDate = str(f, "fromDate");
    const toDate = str(f, "toDate") || fromDate;
    const allDay = bool(f, "allDay") || kind === "holiday" || kind === "vacation";
    if (!fromDate) throw new AppError("INVALID_INPUT", "Elegí la fecha.");
    let start: DateTime, end: DateTime;
    if (allDay) {
      start = DateTime.fromISO(fromDate, { zone: s.timezone }).startOf("day");
      end = DateTime.fromISO(toDate, { zone: s.timezone }).startOf("day").plus({ days: 1 });
    } else {
      const ft = parseHHmm(HHMM(str(f, "fromTime"), "Desde"));
      const tt = parseHHmm(HHMM(str(f, "toTime"), "Hasta"));
      start = DateTime.fromISO(fromDate, { zone: s.timezone }).set({ hour: ft.hour, minute: ft.minute });
      end = DateTime.fromISO(toDate, { zone: s.timezone }).set({ hour: tt.hour, minute: tt.minute });
    }
    if (!start.isValid || !end.isValid || end <= start) throw new AppError("INVALID_INPUT", "Revisá las fechas y horas.");
    const defaults: Record<string, string> = { block: "Horario bloqueado", holiday: "Feriado", vacation: "Vacaciones", extra: "Horario especial" };
    await db.insert(scheduleExceptions).values({
      kind,
      title: str(f, "title") || defaults[kind],
      startAt: start.toJSDate(),
      endAt: end.toJSDate(),
      locationId: num(f, "locationId") || null,
    });
    await logChange(a.id, "exception.added", "schedule_exception");
    return kind === "extra" ? "Horario especial agregado" : "Bloqueo guardado. Los turnos ya reservados en ese horario no se modifican.";
  });
}

export async function deleteException(f: FormData) {
  const a = await requireAdmin();
  await runAction("/admin/bloqueos", async () => {
    await db.delete(scheduleExceptions).where(eq(scheduleExceptions.id, num(f, "id")));
    await logChange(a.id, "exception.deleted", "schedule_exception", num(f, "id"));
    return "Eliminado";
  });
}

/** Importa feriados nacionales desde la API pública ArgentinaDatos. */
export async function importHolidays(f: FormData) {
  const a = await requireAdmin();
  await runAction("/admin/bloqueos", async () => {
    const s = await getSettings();
    const year = intIn(num(f, "year"), 2024, 2100, "Año");
    let list: { fecha: string; nombre: string }[];
    try {
      const res = await fetch(`https://api.argentinadatos.com/v1/feriados/${year}`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(String(res.status));
      list = await res.json();
    } catch (e) {
      throw new AppError("INVALID_STATE", `No se pudo consultar el calendario de feriados (${(e as Error).message}). Cargalos a mano.`);
    }
    const existing = await db
      .select()
      .from(scheduleExceptions)
      .where(and(eq(scheduleExceptions.kind, "holiday"), gte(scheduleExceptions.startAt, DateTime.fromObject({ year }, { zone: s.timezone }).toJSDate())));
    const have = new Set(existing.map((e) => DateTime.fromJSDate(e.startAt, { zone: s.timezone }).toISODate()));
    const rows = list
      .filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.fecha) && !have.has(h.fecha))
      .map((h) => {
        const d = DateTime.fromISO(h.fecha, { zone: s.timezone }).startOf("day");
        return { kind: "holiday", title: `Feriado: ${h.nombre}`.slice(0, 120), startAt: d.toJSDate(), endAt: d.plus({ days: 1 }).toJSDate(), locationId: null };
      });
    if (rows.length) await db.insert(scheduleExceptions).values(rows);
    await logChange(a.id, "exception.holidays_imported", "schedule_exception", year);
    return `Se importaron ${rows.length} feriados de ${year}. Revisalos: podés borrar los que no apliquen.`;
  });
}

// ---------------- Coberturas ----------------

export async function saveCoverage(f: FormData) {
  const a = await owner();
  const id = num(f, "id");
  await runAction(id ? `/admin/coberturas/${id}` : "/admin/coberturas", async () => {
    const name = str(f, "name");
    if (!name) throw new AppError("INVALID_INPUT", "Ingresá el nombre.");
    const slug = slugify(str(f, "slug") || name);
    const timeFrom = str(f, "timeFrom") || null;
    const timeTo = str(f, "timeTo") || null;
    if (timeFrom) HHMM(timeFrom, "Desde");
    if (timeTo) HHMM(timeTo, "Hasta");
    const values = {
      name,
      slug,
      kind: str(f, "kind") || "prepaga",
      active: bool(f, "active"),
      sortOrder: num(f, "sortOrder") || 0,
      requiresMemberNumber: bool(f, "requiresMemberNumber"),
      requiresBirthDate: bool(f, "requiresBirthDate"),
      instructions: str(f, "instructions") || null,
      allowedConsultationTypeIds: ids(f, "allowedConsultationTypeIds"),
      allowedLocationIds: ids(f, "allowedLocationIds"),
      allowedWeekdays: ids(f, "allowedWeekdays"),
      timeFrom,
      timeTo,
      durationOverrideMinutes: num(f, "durationOverrideMinutes") || null,
    };
    try {
      if (id) await db.update(coverages).set(values).where(eq(coverages.id, id));
      else {
        const [c] = await db.insert(coverages).values(values).returning();
        await logChange(a.id, "coverage.created", "coverage", c.id);
        return { redirect: `/admin/coberturas/${c.id}`, message: "Cobertura creada" };
      }
    } catch (e) {
      if (String((e as Error).message).includes("unique") || (e as { cause?: { code?: string } }).cause?.code === "23505")
        throw new AppError("INVALID_INPUT", "Ya existe una cobertura con ese identificador.");
      throw e;
    }
    await logChange(a.id, "coverage.updated", "coverage", id);
    return "Cobertura guardada";
  });
}

// ---------------- Mensajes ----------------

export async function saveTemplate(f: FormData) {
  const a = await owner();
  await runAction("/admin/mensajes", async () => {
    const body = str(f, "body");
    if (body.length < 10) throw new AppError("INVALID_INPUT", "El mensaje es demasiado corto.");
    await db
      .update(messageTemplates)
      .set({
        body,
        emailSubject: str(f, "emailSubject") || "Tu turno",
        whatsappTemplateName: str(f, "whatsappTemplateName") || null,
        whatsappLanguage: str(f, "whatsappLanguage") || "es_AR",
        enabled: bool(f, "enabled"),
        updatedAt: new Date(),
      })
      .where(eq(messageTemplates.key, str(f, "key")));
    await logChange(a.id, "template.updated", "message_template", str(f, "key"));
    return "Mensaje guardado";
  });
}

export async function saveReminderSettings(f: FormData) {
  const a = await owner();
  await runAction("/admin/mensajes", async () => {
    await db
      .update(settings)
      .set({
        reminder48Enabled: bool(f, "reminder48Enabled"),
        reminder24Enabled: bool(f, "reminder24Enabled"),
        reminderWindowStart: HHMM(str(f, "reminderWindowStart"), "Desde"),
        reminderWindowEnd: HHMM(str(f, "reminderWindowEnd"), "Hasta"),
      })
      .where(eq(settings.id, 1));
    await logChange(a.id, "settings.reminders", "settings", 1);
    return "Recordatorios actualizados (aplica a las próximas reservas)";
  });
}

export async function retryFailed() {
  const a = await owner();
  await runAction("/admin/mensajes", async () => {
    const { notifications } = await import("@/db/schema");
    await db
      .update(notifications)
      .set({ status: "pending", attempts: 0, nextAttemptAt: null, lastError: null })
      .where(and(eq(notifications.status, "failed"), gte(notifications.createdAt, new Date(Date.now() - 7 * 86400_000))));
    await audit({ type: "admin", id: a.id }, "notifications.retry", "notification");
    const r = await processOutbox(100);
    return `Reintento: ${r.sent} enviados, ${r.failed} fallidos.`;
  });
}

// ---------------- Integraciones ----------------

export async function saveGoogleCalendar(f: FormData) {
  const a = await owner();
  await runAction("/admin/integraciones", async () => {
    const calendarId = str(f, "calendarId");
    const cals = await listCalendars();
    const cal = cals.find((c) => c.id === calendarId);
    if (!cal || !["owner", "writer"].includes(cal.accessRole)) throw new AppError("INVALID_INPUT", "Elegí un calendario en el que tengas permiso de escritura.");
    await db
      .update(googleIntegration)
      .set({ calendarId, calendarSummary: cal.summary, extraBusyCalendarIds: f.getAll("extraBusy").map(String).filter((x) => x !== calendarId) })
      .where(eq(googleIntegration.id, 1));
    await logChange(a.id, "google.calendar_selected", "integration", "google");
    return "Calendario guardado. Los turnos se sincronizarán en la próxima pasada.";
  });
}

export async function saveGoogleOptions(f: FormData) {
  const a = await owner();
  await runAction("/admin/integraciones", async () => {
    await db
      .update(settings)
      .set({
        googleOnCancel: str(f, "googleOnCancel") === "mark" ? "mark" : "delete",
        googleExternalChange: str(f, "googleExternalChange") === "cancel" ? "cancel" : "review",
        googleAllDayBlocks: bool(f, "googleAllDayBlocks"),
        eventTitleFormat: str(f, "eventTitleFormat") === "initials" ? "initials" : "name",
      })
      .where(eq(settings.id, 1));
    await logChange(a.id, "settings.google", "settings", 1);
  });
}

export async function disconnectGoogle() {
  const a = await owner();
  await runAction("/admin/integraciones", async () => {
    await db
      .update(googleIntegration)
      .set({ refreshTokenEnc: null, accessTokenEnc: null, accessTokenExpiresAt: null, calendarId: null, calendarSummary: null, accountEmail: null })
      .where(eq(googleIntegration.id, 1));
    await logChange(a.id, "google.disconnected", "integration", "google");
    return "Google Calendar desconectado.";
  });
}

export async function runJobsNow() {
  await owner();
  await runAction("/admin/integraciones", async () => {
    const r = await runScheduledJobs();
    return `Tareas ejecutadas: ${JSON.stringify(r).slice(0, 300)}`;
  });
}

export async function testEmail(f: FormData) {
  await owner();
  await runAction("/admin/integraciones", async () => {
    const s = await getSettings();
    try {
      await sendEmail({ to: str(f, "to"), subject: "Prueba de correo", text: "¡El envío de correos funciona correctamente!", brandName: s.professionalName, color: s.primaryColor });
    } catch (e) {
      throw new AppError("INVALID_STATE", `Error: ${(e as Error).message}`);
    }
    return "Correo de prueba enviado.";
  });
}

export async function testWhatsApp(f: FormData) {
  await owner();
  await runAction("/admin/integraciones", async () => {
    const to = normalizePhone(str(f, "to"));
    if (!to) throw new AppError("INVALID_INPUT", "Número inválido.");
    try {
      // "hello_world" es la plantilla de prueba que Meta crea por defecto (en inglés)
      const r = await sendWhatsAppTemplate({ to, templateName: str(f, "template") || "hello_world", language: str(f, "lang") || "en_US", bodyParams: [] });
      return `Mensaje enviado (id ${r.id}).`;
    } catch (e) {
      throw new AppError("INVALID_STATE", `Error: ${(e as Error).message}`);
    }
  });
}

// ---------------- Configuración general ----------------

export async function saveProfile(f: FormData) {
  const a = await owner();
  await runAction("/admin/configuracion", async () => {
    const color = (k: string) => {
      const v = str(f, k);
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw new AppError("INVALID_INPUT", "Los colores deben tener el formato #RRGGBB.");
      return v;
    };
    const photoUrl = str(f, "photoUrl") || null;
    if (photoUrl && !/^https:\/\//.test(photoUrl)) throw new AppError("INVALID_INPUT", "La foto debe ser un enlace https://");
    const wa = str(f, "whatsappContact");
    const prescriptionUrl = str(f, "prescriptionUrl") || null;
    if (prescriptionUrl && !/^https:\/\//.test(prescriptionUrl)) throw new AppError("INVALID_INPUT", "El enlace de recetas debe empezar con https://");
    await db
      .update(settings)
      .set({
        professionalName: str(f, "professionalName") || "Profesional",
        specialty: str(f, "specialty") || "",
        bio: str(f, "bio") || null,
        photoUrl,
        attentionInfo: str(f, "attentionInfo") || null,
        whatsappContact: wa ? (normalizePhone(wa) ?? wa.replace(/\D/g, "")) : null,
        contactEmail: str(f, "contactEmail") || null,
        primaryColor: color("primaryColor"),
        accentColor: color("accentColor"),
        waitlistEnabled: bool(f, "waitlistEnabled"),
        dataControllerName: str(f, "dataControllerName") || null,
        privacyExtra: str(f, "privacyExtra") || null,
        prescriptionUrl,
        prescriptionNote: str(f, "prescriptionNote") || null,
        updatedAt: new Date(),
      })
      .where(eq(settings.id, 1));
    await logChange(a.id, "settings.profile", "settings", 1);
  });
}

// ---------------- Pacientes ----------------

export async function savePatient(f: FormData) {
  const a = await requireAdmin();
  const id = str(f, "id");
  await runAction(`/admin/pacientes/${id}`, async () => {
    const phone = normalizePhone(str(f, "phone"));
    if (!phone) throw new AppError("INVALID_INPUT", "Celular inválido.");
    await db
      .update(patients)
      .set({
        fullName: str(f, "fullName"),
        phone,
        email: str(f, "email").toLowerCase() || null,
        memberNumber: str(f, "memberNumber") || null,
        coverageId: num(f, "coverageId") || null,
        consentReminders: bool(f, "consentReminders"),
        adminNotes: str(f, "adminNotes") || null,
        updatedAt: new Date(),
      })
      .where(eq(patients.id, id));
    await audit({ type: "admin", id: a.id }, "patient.updated", "patient", id);
  });
}

/** Derecho de supresión (Ley 25.326): se anonimizan los datos personales y se conserva el registro administrativo. */
export async function anonymizePatient(f: FormData) {
  const a = await owner();
  const id = str(f, "id");
  await runAction(`/admin/pacientes/${id}`, async () => {
    const { appointments } = await import("@/db/schema");
    const future = await db
      .select()
      .from(appointments)
      .where(and(eq(appointments.patientId, id), eq(appointments.status, "confirmed"), gte(appointments.startAt, new Date())));
    if (future.length) throw new AppError("INVALID_STATE", "La paciente tiene turnos futuros. Cancelalos antes de suprimir sus datos.");
    const anon = `anon-${id.slice(0, 8)}`;
    await db.transaction(async (tx) => {
      await tx
        .update(patients)
        .set({ fullName: "Paciente anonimizada", dni: anon, phone: "0", email: null, birthDate: null, memberNumber: null, adminNotes: null, anonymizedAt: new Date() })
        .where(eq(patients.id, id));
      await tx
        .update(appointments)
        .set({ contactName: "Paciente anonimizada", contactPhone: "0", contactEmail: null, memberNumber: null, adminNotes: null })
        .where(eq(appointments.patientId, id));
    });
    await audit({ type: "admin", id: a.id }, "patient.anonymized", "patient", id);
    return "Datos personales suprimidos.";
  });
}

export async function removeWaitlist(f: FormData) {
  const a = await requireAdmin();
  await runAction("/admin/lista-espera", async () => {
    await db.update(waitlist).set({ status: "removed" }).where(eq(waitlist.id, num(f, "id")));
    await audit({ type: "admin", id: a.id }, "waitlist.removed", "waitlist", num(f, "id"));
    return "Quitada de la lista de espera";
  });
}

// ---------------- Usuarios ----------------

export async function addUser(f: FormData) {
  const a = await owner();
  await runAction("/admin/usuarios", async () => {
    const email = str(f, "email").toLowerCase();
    const password = str(f, "password");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("INVALID_INPUT", "Correo inválido.");
    if (password.length < 10) throw new AppError("INVALID_INPUT", "La contraseña debe tener al menos 10 caracteres.");
    await db
      .insert(adminUsers)
      .values({ email, name: str(f, "name") || email, passwordHash: await hashPassword(password), role: str(f, "role") === "owner" ? "owner" : "secretary" })
      .onConflictDoNothing();
    await audit({ type: "admin", id: a.id }, "admin.user_added", "admin_user", email);
    return "Usuario creado";
  });
}

export async function toggleUser(f: FormData) {
  const a = await owner();
  await runAction("/admin/usuarios", async () => {
    const id = str(f, "id");
    if (id === a.id) throw new AppError("INVALID_INPUT", "No podés desactivar tu propio usuario.");
    const [u] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
    await db.update(adminUsers).set({ active: !u.active, sessionVersion: u.sessionVersion + 1 }).where(eq(adminUsers.id, id));
    await audit({ type: "admin", id: a.id }, u.active ? "admin.user_disabled" : "admin.user_enabled", "admin_user", id);
  });
}

export async function changePassword(f: FormData) {
  const a = await requireAdmin();
  await runAction("/admin/usuarios", async () => {
    const [u] = await db.select().from(adminUsers).where(eq(adminUsers.id, a.id));
    if (!(await checkPassword(str(f, "current"), u.passwordHash))) throw new AppError("INVALID_INPUT", "La contraseña actual no es correcta.");
    const next = str(f, "next");
    if (next.length < 10) throw new AppError("INVALID_INPUT", "La nueva contraseña debe tener al menos 10 caracteres.");
    // Cambiar la versión de sesión cierra las demás sesiones abiertas
    await db.update(adminUsers).set({ passwordHash: await hashPassword(next), sessionVersion: u.sessionVersion + 1 }).where(eq(adminUsers.id, a.id));
    await audit({ type: "admin", id: a.id }, "admin.password_changed", "admin_user", a.id);
    return { redirect: "/admin/login", message: "Contraseña cambiada. Ingresá de nuevo." };
  });
}

