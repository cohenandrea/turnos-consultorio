import nodemailer, { type Transporter } from "nodemailer";
import { env, isEmailConfigured } from "@/lib/env";

let transporter: Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    const s = env.smtp();
    transporter = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.port === 465,
      auth: s.user ? { user: s.user, pass: s.pass } : undefined,
    });
  }
  return transporter;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendEmail(opts: { to: string; subject: string; text: string; brandName: string; color?: string }) {
  if (!isEmailConfigured()) throw new Error("El correo electrónico no está configurado");
  const htmlBody = escapeHtml(opts.text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:' + (opts.color ?? "#4a6b5c") + '">$1</a>')
    .replace(/\n/g, "<br>");
  const html = `<!doctype html><html><body style="margin:0;background:#f7f5f2;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border-radius:16px;padding:28px;color:#2b2b2b;font-size:16px;line-height:1.55">
      <div style="font-weight:bold;color:${opts.color ?? "#4a6b5c"};margin-bottom:16px">${escapeHtml(opts.brandName)}</div>
      ${htmlBody}
    </div>
    <p style="color:#888;font-size:12px;text-align:center;margin-top:16px">Mensaje automático. No respondas a este correo.</p>
  </div></body></html>`;
  const info = await getTransporter().sendMail({ from: env.smtp().from, to: opts.to, subject: opts.subject, text: opts.text, html });
  return { id: String(info.messageId ?? "") };
}
