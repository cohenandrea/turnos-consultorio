import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  jsonb,
  serial,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

/** Configuración general del consultorio (una sola fila, id = 1). */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  professionalName: text("professional_name").notNull(),
  specialty: text("specialty").notNull(),
  bio: text("bio"),
  photoUrl: text("photo_url"),
  whatsappContact: text("whatsapp_contact"),
  contactEmail: text("contact_email"),
  attentionInfo: text("attention_info"),
  primaryColor: text("primary_color").notNull().default("#4a6b5c"),
  accentColor: text("accent_color").notNull().default("#c98b6b"),
  timezone: text("timezone").notNull().default("America/Argentina/Buenos_Aires"),
  // Reglas de agenda
  slotIntervalMinutes: integer("slot_interval_minutes").notNull().default(30),
  bufferMinutes: integer("buffer_minutes").notNull().default(0),
  minNoticeHours: integer("min_notice_hours").notNull().default(12),
  maxAdvanceDays: integer("max_advance_days").notNull().default(60),
  maxActivePerPatient: integer("max_active_per_patient").notNull().default(1),
  bookingStartDate: date("booking_start_date", { mode: "string" }), // no se ofrecen turnos antes de esta fecha
  // Políticas de cancelación / reprogramación
  cancelLimitHours: integer("cancel_limit_hours").notNull().default(24),
  rescheduleLimitHours: integer("reschedule_limit_hours").notNull().default(24),
  // Recordatorios
  reminder48Enabled: boolean("reminder_48_enabled").notNull().default(true),
  reminder24Enabled: boolean("reminder_24_enabled").notNull().default(true),
  reminderWindowStart: text("reminder_window_start").notNull().default("08:00"),
  reminderWindowEnd: text("reminder_window_end").notNull().default("21:00"),
  // Google Calendar
  googleOnCancel: text("google_on_cancel").notNull().default("delete"), // delete | mark
  googleExternalChange: text("google_external_change").notNull().default("review"), // review | cancel
  googleAllDayBlocks: boolean("google_all_day_blocks").notNull().default(true),
  eventTitleFormat: text("event_title_format").notNull().default("name"), // name | initials
  // Lista de espera
  waitlistEnabled: boolean("waitlist_enabled").notNull().default(true),
  // Privacidad
  dataControllerName: text("data_controller_name"),
  privacyExtra: text("privacy_extra"),
  // Registro para recetas y órdenes electrónicas (opcional)
  prescriptionUrl: text("prescription_url"),
  prescriptionNote: text("prescription_note"),
  lastCronAt: ts("last_cron_at"),
  updatedAt: updatedAt(),
});

export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  mapsUrl: text("maps_url"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const consultationTypes = pgTable("consultation_types", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const coverages = pgTable("coverages", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("prepaga"), // prepaga | obra_social | particular | otra
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  requiresMemberNumber: boolean("requires_member_number").notNull().default(true),
  requiresBirthDate: boolean("requires_birth_date").notNull().default(false),
  instructions: text("instructions"),
  // Reglas específicas (arrays vacíos = sin restricción)
  allowedConsultationTypeIds: jsonb("allowed_consultation_type_ids").$type<number[]>().notNull().default([]),
  allowedLocationIds: jsonb("allowed_location_ids").$type<number[]>().notNull().default([]),
  allowedWeekdays: jsonb("allowed_weekdays").$type<number[]>().notNull().default([]), // 1=lunes … 7=domingo
  timeFrom: text("time_from"), // "HH:mm"
  timeTo: text("time_to"),
  durationOverrideMinutes: integer("duration_override_minutes"),
});

/** Horario semanal de atención. Varias franjas por día = descansos entre ellas. */
export const scheduleRules = pgTable("schedule_rules", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(), // 1=lunes … 7=domingo
  startTime: text("start_time").notNull(), // "HH:mm"
  endTime: text("end_time").notNull(),
  active: boolean("active").notNull().default(true),
});

/** Bloqueos, feriados, vacaciones y horarios especiales (extra). */
export const scheduleExceptions = pgTable(
  "schedule_exceptions",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(), // block | holiday | vacation | extra
    title: text("title").notNull(),
    startAt: ts("start_at").notNull(),
    endAt: ts("end_at").notNull(),
    locationId: integer("location_id").references(() => locations.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("schedule_exceptions_range_idx").on(t.startAt, t.endAt)],
);

export const patients = pgTable(
  "patients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    dni: text("dni").notNull(),
    phone: text("phone").notNull(), // E.164 (+549…)
    email: text("email"),
    birthDate: date("birth_date"),
    coverageId: integer("coverage_id").references(() => coverages.id),
    memberNumber: text("member_number"),
    consentReminders: boolean("consent_reminders").notNull().default(false),
    consentAt: ts("consent_at"),
    privacyAcceptedAt: ts("privacy_accepted_at"),
    adminNotes: text("admin_notes"),
    anonymizedAt: ts("anonymized_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("patients_dni_idx").on(t.dni), index("patients_phone_idx").on(t.phone), index("patients_email_idx").on(t.email)],
);

/**
 * Turnos. La restricción de exclusión (ver migración 0001) impide a nivel de base de datos
 * que dos turnos confirmados se superpongan: tstzrange(start_at, block_end_at) WITH &&.
 */
export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id").notNull().references(() => patients.id),
    coverageId: integer("coverage_id").notNull().references(() => coverages.id),
    consultationTypeId: integer("consultation_type_id").notNull().references(() => consultationTypes.id),
    locationId: integer("location_id").notNull().references(() => locations.id),
    startAt: ts("start_at").notNull(),
    endAt: ts("end_at").notNull(),
    blockEndAt: ts("block_end_at").notNull(), // end_at + tiempo entre pacientes
    status: text("status").notNull().default("confirmed"), // confirmed | cancelled | completed | no_show
    source: text("source").notNull().default("web"), // web | admin
    // Datos de contacto usados para este turno (pueden diferir de la ficha si no se verificó identidad)
    contactName: text("contact_name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    contactEmail: text("contact_email"),
    memberNumber: text("member_number"),
    consentReminders: boolean("consent_reminders").notNull().default(false),
    attendanceConfirmedAt: ts("attendance_confirmed_at"),
    rescheduleCount: integer("reschedule_count").notNull().default(0),
    cancelledAt: ts("cancelled_at"),
    cancelledBy: text("cancelled_by"), // patient | admin | google
    // Enlace de gestión (solo se guarda el hash)
    manageTokenHash: text("manage_token_hash").notNull(),
    manageTokenEnc: text("manage_token_enc").notNull(), // cifrado, para poder incluir el enlace en recordatorios
    manageTokenRevokedAt: ts("manage_token_revoked_at"),
    // Google Calendar
    googleEventId: text("google_event_id"),
    googleCalendarId: text("google_calendar_id"),
    googleSyncStatus: text("google_sync_status").notNull().default("pending"), // pending | synced | error | not_connected
    googleSyncAttempts: integer("google_sync_attempts").notNull().default(0),
    googleSyncError: text("google_sync_error"),
    googleNextAttemptAt: ts("google_next_attempt_at"),
    syncVersion: integer("sync_version").notNull().default(1), // se incrementa en cada cambio que Google debe reflejar
    // Revisión manual
    needsReview: boolean("needs_review").notNull().default(false),
    reviewReason: text("review_reason"),
    adminNotes: text("admin_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("appointments_start_idx").on(t.startAt),
    index("appointments_patient_idx").on(t.patientId),
    uniqueIndex("appointments_token_idx").on(t.manageTokenHash),
    index("appointments_sync_idx").on(t.googleSyncStatus),
  ],
);

/** Bandeja de salida de mensajes (WhatsApp / email). dedupe_key evita duplicados. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appointmentId: uuid("appointment_id").references(() => appointments.id, { onDelete: "cascade" }),
    waitlistId: integer("waitlist_id"),
    kind: text("kind").notNull(), // confirmation | reminder_48 | reminder_24 | cancellation | reschedule | waitlist_offer
    channel: text("channel").notNull(), // whatsapp | email
    recipient: text("recipient").notNull(),
    payload: jsonb("payload").$type<Record<string, string>>(),
    scheduledFor: ts("scheduled_for").notNull(),
    status: text("status").notNull().default("pending"), // pending | sending | sent | delivered | read | failed | cancelled | skipped
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at"),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    sentAt: ts("sent_at"),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("notifications_dedupe_idx").on(t.dedupeKey),
    index("notifications_due_idx").on(t.status, t.scheduledFor),
    index("notifications_provider_idx").on(t.providerMessageId),
  ],
);

export const messageTemplates = pgTable("message_templates", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  body: text("body").notNull(),
  emailSubject: text("email_subject").notNull(),
  whatsappTemplateName: text("whatsapp_template_name"),
  whatsappLanguage: text("whatsapp_language").notNull().default("es_AR"),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: updatedAt(),
});

/** Conexión con Google (una fila, id = 1). El refresh token se guarda cifrado. */
export const googleIntegration = pgTable("google_integration", {
  id: integer("id").primaryKey().default(1),
  accountEmail: text("account_email"),
  refreshTokenEnc: text("refresh_token_enc"),
  accessTokenEnc: text("access_token_enc"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  calendarId: text("calendar_id"),
  calendarSummary: text("calendar_summary"),
  extraBusyCalendarIds: jsonb("extra_busy_calendar_ids").$type<string[]>().notNull().default([]),
  connectedAt: ts("connected_at"),
  lastSyncAt: ts("last_sync_at"),
  lastError: text("last_error"),
  lastErrorAt: ts("last_error_at"),
});

export const waitlist = pgTable("waitlist", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  coverageId: integer("coverage_id").notNull().references(() => coverages.id),
  consultationTypeId: integer("consultation_type_id").notNull().references(() => consultationTypes.id),
  wantsBefore: ts("wants_before"), // avisar solo si aparece un turno antes de esta fecha
  timePreference: text("time_preference").notNull().default("any"), // any | morning | afternoon
  consent: boolean("consent").notNull().default(false),
  status: text("status").notNull().default("active"), // active | notified | booked | removed
  notifyCount: integer("notify_count").notNull().default(0),
  lastNotifiedAt: ts("last_notified_at"),
  removeTokenHash: text("remove_token_hash").notNull(),
  createdAt: createdAt(),
});

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    target: text("target").notNull(), // email o teléfono normalizado
    channel: text("channel").notNull(),
    codeHash: text("code_hash").notNull(),
    patientId: uuid("patient_id"),
    expiresAt: ts("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: ts("consumed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("otp_target_idx").on(t.target)],
);

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("owner"), // owner | secretary
  active: boolean("active").notNull().default(true),
  sessionVersion: integer("session_version").notNull().default(1),
  lastLoginAt: ts("last_login_at"),
  createdAt: createdAt(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    at: ts("at").notNull().defaultNow(),
    actorType: text("actor_type").notNull(), // admin | patient | system | google
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>(),
  },
  (t) => [index("audit_at_idx").on(t.at), index("audit_entity_idx").on(t.entity, t.entityId)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: ts("window_start").notNull(),
});

export type Settings = typeof settings.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type ConsultationType = typeof consultationTypes.$inferSelect;
export type Coverage = typeof coverages.$inferSelect;
export type ScheduleRule = typeof scheduleRules.$inferSelect;
export type ScheduleException = typeof scheduleExceptions.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type WaitlistEntry = typeof waitlist.$inferSelect;
