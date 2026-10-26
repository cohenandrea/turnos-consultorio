import crypto from "node:crypto";
import { env } from "./env";

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Hash con clave (para códigos cortos como OTP, que serían fáciles de adivinar con sha256 simple). */
export function hmac(value: string) {
  return crypto.createHmac("sha256", env.sessionSecret()).update(value).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function key() {
  return crypto.createHash("sha256").update(env.encryptionKey()).digest();
}

/** Cifrado AES-256-GCM. Formato: iv.tag.datos (base64url). */
export function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(payload: string) {
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function sixDigitCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}
