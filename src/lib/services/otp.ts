/**
 * Recuperación segura de datos: se envía un código al celular o correo YA REGISTRADO.
 * Nunca se muestran datos solo por conocer un DNI o un teléfono.
 */
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { coverages, messageTemplates, otpCodes, patients } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isEmailConfigured, isWhatsAppConfigured } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { sendEmail } from "@/lib/messaging/email";
import { renderTemplate } from "@/lib/messaging/templates";
import { sendWhatsAppTemplate } from "@/lib/messaging/whatsapp";
import { signPatientVerification } from "@/lib/patient-verify";
import { normalizePhone } from "@/lib/phone";
import { rateLimit } from "@/lib/ratelimit";
import { hmac, safeEqual, sixDigitCode } from "@/lib/security";
import { getSettings } from "./config";

export function availableOtpChannels() {
  return { whatsapp: isWhatsAppConfigured(), email: isEmailConfigured() };
}

function normalizeTarget(channel: "email" | "whatsapp", value: string) {
  if (channel === "email") {
    const v = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new AppError("INVALID_INPUT", "Revisá el correo electrónico.");
    return v;
  }
  const p = normalizePhone(value);
  if (!p) throw new AppError("INVALID_INPUT", "Revisá el número de celular.");
  return p;
}

export async function requestOtp(channel: "email" | "whatsapp", value: string, ip: string) {
  if (!availableOtpChannels()[channel]) throw new AppError("INVALID_INPUT", "Ese medio de verificación no está disponible.");
  const target = normalizeTarget(channel, value);
  await rateLimit(`otp:ip:${ip}`, 10, 3600);
  await rateLimit(`otp:t:${target}`, 3, 900);
  const [patient] = await db
    .select()
    .from(patients)
    .where(and(isNull(patients.anonymizedAt), channel === "email" ? sql`lower(${patients.email}) = ${target}` : eq(patients.phone, target)))
    .orderBy(desc(patients.updatedAt))
    .limit(1);
  // Respuesta idéntica exista o no la paciente (evita revelar quién está registrada)
  if (!patient) return { sent: true };
  const code = sixDigitCode();
  await db.insert(otpCodes).values({
    target,
    channel,
    codeHash: hmac(`${target}:${code}`),
    patientId: patient.id,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  const [tpl] = await db.select().from(messageTemplates).where(eq(messageTemplates.key, "otp"));
  const s = await getSettings();
  try {
    if (channel === "email") {
      await sendEmail({
        to: target,
        subject: tpl?.emailSubject ?? "Tu código de verificación",
        text: renderTemplate(tpl?.body ?? "Tu código es {codigo}", { codigo: code }),
        brandName: s.professionalName,
        color: s.primaryColor,
      });
    } else {
      await sendWhatsAppTemplate({
        to: target,
        templateName: tpl?.whatsappTemplateName ?? "codigo_verificacion",
        language: tpl?.whatsappLanguage ?? "es_AR",
        bodyParams: [code],
        otpButtonParam: code,
      });
    }
  } catch (e) {
    console.error("Error enviando código de verificación", (e as Error).message);
  }
  return { sent: true };
}

export async function verifyOtp(channel: "email" | "whatsapp", value: string, code: string, ip: string) {
  await rateLimit(`otpv:ip:${ip}`, 30, 3600);
  const target = normalizeTarget(channel, value);
  const [row] = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.target, target), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, new Date())))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  const invalid = new AppError("INVALID_INPUT", "El código no es correcto o ya venció.");
  if (!row || row.attempts >= 5) throw invalid;
  await db.update(otpCodes).set({ attempts: row.attempts + 1 }).where(eq(otpCodes.id, row.id));
  if (!safeEqual(row.codeHash, hmac(`${target}:${code.trim()}`))) throw invalid;
  await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, row.id));
  const [p] = await db.select().from(patients).where(eq(patients.id, row.patientId!));
  if (!p) throw invalid;
  const [cov] = p.coverageId ? await db.select().from(coverages).where(eq(coverages.id, p.coverageId)) : [];
  await audit({ type: "patient", id: p.id }, "patient.verified", "patient", p.id, { channel });
  return {
    verificationToken: await signPatientVerification(p.id),
    patient: {
      fullName: p.fullName,
      dni: p.dni,
      phone: p.phone,
      email: p.email,
      birthDate: p.birthDate,
      memberNumber: p.memberNumber,
      coverageSlug: cov?.slug ?? null,
    },
  };
}

export async function cleanupOtps() {
  await db.delete(otpCodes).where(or(sql`${otpCodes.expiresAt} < now() - interval '1 day'`, sql`${otpCodes.consumedAt} IS NOT NULL`));
}
