/**
 * WhatsApp Business Platform – Cloud API de Meta.
 * Los mensajes iniciados por la empresa (confirmaciones, recordatorios) deben usar
 * PLANTILLAS APROBADAS por Meta. https://developers.facebook.com/docs/whatsapp/cloud-api
 */
import crypto from "node:crypto";
import { env, isWhatsAppConfigured } from "@/lib/env";
import { safeEqual } from "@/lib/security";

export type WaTemplateMessage = {
  to: string; // E.164 sin "+"
  templateName: string;
  language: string;
  bodyParams: string[];
  /** Plantillas de autenticación (código): el código también va en el botón "copiar". */
  otpButtonParam?: string;
};

export async function sendWhatsAppTemplate(msg: WaTemplateMessage): Promise<{ id: string }> {
  if (!isWhatsAppConfigured()) throw new Error("WhatsApp no está configurado");
  const { token, phoneNumberId, apiVersion } = env.whatsapp();
  const components: unknown[] = [];
  if (msg.bodyParams.length) {
    components.push({ type: "body", parameters: msg.bodyParams.map((text) => ({ type: "text", text })) });
  }
  if (msg.otpButtonParam) {
    components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: msg.otpButtonParam }] });
  }
  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: msg.to,
      type: "template",
      template: { name: msg.templateName, language: { code: msg.language }, components },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json?.error;
    throw new Error(`WhatsApp ${res.status}: ${err?.message ?? res.statusText}${err?.code ? ` (código ${err.code})` : ""}`);
  }
  const id = json?.messages?.[0]?.id;
  if (!id) throw new Error("WhatsApp: respuesta sin id de mensaje");
  return { id };
}

/** Verifica la firma X-Hub-Signature-256 de los webhooks de Meta. */
export function verifyWebhookSignature(rawBody: string, header: string | null) {
  const secret = env.whatsapp().appSecret;
  if (!secret) return false;
  if (!header?.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, header);
}
