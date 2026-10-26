import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

const key = () => new TextEncoder().encode(env.sessionSecret());

/** Token breve que prueba que la paciente verificó su identidad por código. */
export async function signPatientVerification(patientId: string) {
  return new SignJWT({ pid: patientId, purpose: "patient-verify" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(key());
}

export async function readPatientVerification(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload.purpose === "patient-verify" && typeof payload.pid === "string" ? payload.pid : null;
  } catch {
    return null;
  }
}
