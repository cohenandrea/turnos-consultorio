/**
 * Datos iniciales EDITABLES desde el panel. Las coberturas son ejemplos,
 * no afirmaciones sobre convenios vigentes.
 */
export const seedSettings = {
  id: 1,
  professionalName: "Dra. Nombre Apellido",
  specialty: "Especialidad médica",
  bio: "Atención personalizada, con tiempo para escucharte.",
  attentionInfo: "Atención con turno previo. Llegá 10 minutos antes y traé tu credencial y DNI.",
  whatsappContact: null,
  contactEmail: null,
};

export const seedLocations = [
  { name: "Consultorio principal", address: "Av. Ejemplo 1234, 5° B, CABA", mapsUrl: null, notes: null, sortOrder: 0 },
];

export const seedConsultationTypes = [
  { slug: "primera-vez", name: "Primera consulta", description: "Si es la primera vez que te atendés conmigo.", durationMinutes: 40, sortOrder: 0 },
  { slug: "control", name: "Control", description: "Seguimiento o control periódico.", durationMinutes: 30, sortOrder: 1 },
];

export const seedCoverages = [
  { slug: "osde", name: "OSDE", kind: "prepaga" },
  { slug: "swiss-medical", name: "Swiss Medical", kind: "prepaga" },
  { slug: "galeno", name: "Galeno", kind: "prepaga" },
  { slug: "medicus", name: "Medicus", kind: "prepaga" },
  { slug: "omint", name: "Omint", kind: "prepaga" },
  { slug: "accord-salud", name: "Accord Salud", kind: "obra_social" },
  { slug: "otras", name: "Otra cobertura", kind: "otra", instructions: "Indicá tu cobertura en el número de afiliada. Te confirmaremos si la aceptamos." },
  { slug: "particular", name: "Particular (sin cobertura)", kind: "particular", requiresMemberNumber: false },
].map((c, i) => ({ requiresMemberNumber: true, instructions: null, ...c, sortOrder: i }));

/** Lunes a viernes 9 a 13 y 15 a 19 (el corte 13–15 es el descanso). */
export const seedScheduleRules = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, startTime: "09:00", endTime: "13:00" },
  { weekday, startTime: "15:00", endTime: "19:00" },
]);

export const TEMPLATE_KEYS = ["confirmation", "reminder_48", "reminder_24", "reschedule", "cancellation", "waitlist_offer", "otp"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export const seedTemplates: {
  key: TemplateKey;
  label: string;
  emailSubject: string;
  body: string;
  whatsappTemplateName: string;
}[] = [
  {
    key: "confirmation",
    label: "Confirmación de turno",
    emailSubject: "Tu turno quedó confirmado",
    whatsappTemplateName: "turno_confirmado",
    body:
      "Hola, {nombre}. Tu turno con {profesional} quedó confirmado para el {fecha} a las {hora}, en {direccion}.\n\n" +
      "Podés consultar, reprogramar o cancelar tu turno desde el siguiente enlace: {link}\n\n¡Te esperamos!",
  },
  {
    key: "reminder_48",
    label: "Recordatorio 48 horas antes",
    emailSubject: "Recordatorio de tu turno",
    whatsappTemplateName: "recordatorio_48h",
    body:
      "Hola, {nombre}. Te recordamos que tenés un turno el {fecha} a las {hora}.\n\n" +
      "Si necesitás cambiarlo o cancelarlo, podés hacerlo desde acá: {link}",
  },
  {
    key: "reminder_24",
    label: "Recordatorio 24 horas antes",
    emailSubject: "Mañana es tu turno",
    whatsappTemplateName: "recordatorio_24h",
    body:
      "Hola, {nombre}. Mañana te esperamos a las {hora} para tu turno.\n\n" +
      "Si no podés asistir, por favor cancelalo o reprogramalo desde este enlace: {link}",
  },
  {
    key: "reschedule",
    label: "Turno reprogramado",
    emailSubject: "Tu turno fue reprogramado",
    whatsappTemplateName: "turno_reprogramado",
    body:
      "Hola, {nombre}. Tu turno con {profesional} fue reprogramado para el {fecha} a las {hora}, en {direccion}.\n\n" +
      "Podés gestionarlo desde: {link}",
  },
  {
    key: "cancellation",
    label: "Turno cancelado",
    emailSubject: "Tu turno fue cancelado",
    whatsappTemplateName: "turno_cancelado",
    body:
      "Hola, {nombre}. Tu turno del {fecha} a las {hora} fue cancelado.\n\n" +
      "Si querés, podés reservar uno nuevo cuando lo necesites: {link}",
  },
  {
    key: "waitlist_offer",
    label: "Lista de espera: se liberó un turno",
    emailSubject: "Se liberó un turno",
    whatsappTemplateName: "turno_liberado",
    body:
      "Hola, {nombre}. Se liberó un turno con {profesional} el {fecha} a las {hora}.\n\n" +
      "Si te sirve, reservalo desde acá (se asigna a quien lo confirme primero): {link}",
  },
  {
    key: "otp",
    label: "Código de verificación",
    emailSubject: "Tu código de verificación",
    whatsappTemplateName: "codigo_verificacion",
    body: "Tu código para recuperar tus datos es {codigo}. Vence en 10 minutos. Si no lo pediste, ignorá este mensaje.",
  },
];
