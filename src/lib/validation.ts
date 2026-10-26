import { z } from "zod";
import { normalizePhone } from "./phone";

const trimmed = (max: number) => z.string().trim().max(max);

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) {
      ctx.addIssue({ code: "custom", message: "Ingresá un celular válido, con código de área (ej.: 11 2345-6789)." });
      return z.NEVER;
    }
    return p;
  });

export const dniSchema = z
  .string()
  .transform((v) => v.replace(/[.\s-]/g, ""))
  .refine((v) => /^\d{7,8}$/.test(v), "Ingresá tu DNI sin puntos (7 u 8 números).");

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(120)
  .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), "Revisá el correo electrónico.")
  .optional()
  .transform((v) => v || null);

export const birthDateSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null)
  .refine((v) => {
    if (!v) return true;
    const d = new Date(v + "T12:00:00Z");
    return /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(d.getTime()) && d.getTime() < Date.now() && d.getUTCFullYear() > 1900;
  }, "Revisá la fecha de nacimiento.");

export const bookingSchema = z.object({
  coverageId: z.coerce.number().int().positive(),
  consultationTypeId: z.coerce.number().int().positive(),
  locationId: z.coerce.number().int().positive(),
  start: z.iso.datetime(),
  fullName: trimmed(100).min(5, "Ingresá tu nombre y apellido.").refine((v) => v.includes(" "), "Ingresá nombre y apellido."),
  dni: dniSchema,
  phone: phoneSchema,
  email: optionalEmail,
  birthDate: birthDateSchema,
  memberNumber: trimmed(40).optional().transform((v) => v || null),
  consentReminders: z.boolean(),
  privacyAccepted: z.literal(true, { error: "Necesitás aceptar la política de privacidad." }),
  verificationToken: z.string().max(2000).optional().nullable(),
  website: z.string().max(0).optional(), // anti-bots (campo oculto)
});

export const waitlistSchema = z.object({
  fullName: trimmed(100).min(5, "Ingresá tu nombre y apellido."),
  phone: phoneSchema,
  email: optionalEmail,
  coverageId: z.coerce.number().int().positive(),
  consultationTypeId: z.coerce.number().int().positive(),
  wantsBefore: z.string().optional().nullable(),
  timePreference: z.enum(["any", "morning", "afternoon"]),
  consent: z.literal(true, { error: "Necesitamos tu autorización para avisarte." }),
});

export function firstZodMessage(e: z.ZodError) {
  return e.issues[0]?.message ?? "Revisá los datos ingresados.";
}
