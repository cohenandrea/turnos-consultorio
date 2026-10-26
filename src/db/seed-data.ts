/**
 * Datos iniciales del consultorio. Todo es EDITABLE desde el panel.
 */
export const seedSettings = {
  id: 1,
  professionalName: "Dra. Andrea Cohen",
  specialty: "Ginecología y Obstetricia",
  bio: "Médica especialista en Ginecología y Obstetricia. Acompañamiento cercano en cada etapa de tu vida.",
  attentionInfo: "Atención con turno previo. Te pedimos llegar 10 minutos antes con tu DNI y credencial de tu cobertura.",
  whatsappContact: null,
  contactEmail: "ginecobyandrea@gmail.com",
  primaryColor: "#B5536B",
  accentColor: "#7A2E45",
  slotIntervalMinutes: 15,
  bookingStartDate: "2027-01-01",
  dataControllerName: "Dra. Andrea Cohen",
  prescriptionUrl: "https://app.rcta.me/patients/a9cde68b831e58bd4e41961e2143aadb3e74b9a1",
  prescriptionNote: "Para poder recibir recetas y órdenes electrónicas de la Dra. Cohen es necesario completar este formulario.",
};

/** Sedes con su horario semanal (1 = lunes … 7 = domingo). Las horas de fin son el fin de la atención. */
export const seedLocations = [
  {
    name: "Consultorio Palermo",
    address: "Av. Raúl Scalabrini Ortiz 2356, 6° F, CABA",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Av.+Scalabrini+Ortiz+2356,+CABA",
    notes: "6° piso, departamento F",
    sortOrder: 0,
    rules: [
      { weekday: 1, startTime: "15:00", endTime: "18:45" },
      { weekday: 3, startTime: "14:00", endTime: "18:00" },
    ],
  },
  {
    name: "Consultorio Caballito",
    address: "Riglos 188, 3° piso, CABA",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Riglos+188,+CABA",
    notes: "3° piso",
    sortOrder: 1,
    rules: [{ weekday: 4, startTime: "14:00", endTime: "18:30" }],
  },
];

export const seedConsultationTypes = [
  { slug: "consulta-ginecologica", name: "Consulta ginecológica", description: "Consulta ginecológica con la Dra. Andrea Cohen.", durationMinutes: 15, sortOrder: 0 },
];

export const seedCoverages = [
  { slug: "osde", name: "OSDE", kind: "prepaga" },
  { slug: "swiss-medical", name: "Swiss Medical", kind: "prepaga" },
  { slug: "medicus", name: "Medicus", kind: "prepaga" },
  { slug: "sancor-salud", name: "Sancor Salud", kind: "prepaga" },
  { slug: "avalian", name: "Avalian", kind: "prepaga" },
  { slug: "hominis", name: "Hominis", kind: "prepaga" },
  { slug: "omint", name: "Omint", kind: "prepaga" },
  { slug: "particular", name: "Particular", kind: "particular", requiresMemberNumber: false },
].map((c, i) => ({ requiresMemberNumber: true, instructions: null, ...c, sortOrder: i }));

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
