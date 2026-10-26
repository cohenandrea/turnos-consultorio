/** Lectura centralizada de variables de entorno (solo servidor). */
export const env = {
  appUrl: () =>
    (
      process.env.APP_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      // Vercel informa el dominio de producción automáticamente
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
    ).replace(/\/$/, ""),
  sessionSecret: () => {
    const s = process.env.SESSION_SECRET;
    if (!s || s.length < 32) throw new Error("SESSION_SECRET debe tener al menos 32 caracteres");
    return s;
  },
  encryptionKey: () => {
    const s = process.env.ENCRYPTION_KEY;
    if (!s || s.length < 32) throw new Error("ENCRYPTION_KEY debe tener al menos 32 caracteres");
    return s;
  },
  cronSecret: () => process.env.CRON_SECRET ?? "",
  google: () => ({
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  }),
  whatsapp: () => ({
    token: process.env.WHATSAPP_TOKEN ?? "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
    appSecret: process.env.WHATSAPP_APP_SECRET ?? "",
    apiVersion: process.env.WHATSAPP_API_VERSION ?? "v21.0",
  }),
  smtp: () => ({
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.EMAIL_FROM ?? "",
  }),
};

export const isGoogleConfigured = () => Boolean(env.google().clientId && env.google().clientSecret);
export const isWhatsAppConfigured = () => Boolean(env.whatsapp().token && env.whatsapp().phoneNumberId);
export const isEmailConfigured = () => Boolean(env.smtp().host && env.smtp().from);
