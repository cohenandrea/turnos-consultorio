/**
 * Normaliza celulares argentinos al formato que usa WhatsApp (E.164 sin "+"): 549 + área + número.
 * Acepta "11 2345-6789", "011 15 2345-6789", "+54 9 11 2345 6789", etc.
 * Devuelve null si no parece un celular válido.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (raw.startsWith("+") || raw.startsWith("00")) {
    if (!d.startsWith("54")) return d.length >= 8 && d.length <= 15 ? d : null; // otro país
  }
  if (d.startsWith("54")) {
    d = d.slice(2);
    if (d.startsWith("9")) d = d.slice(1);
  }
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 12) {
    // Quitar el "15" después del código de área (2, 3 o 4 dígitos)
    const positions = d.startsWith("11") ? [2] : [3, 4, 2];
    for (const i of positions) {
      if (d.slice(i, i + 2) === "15") {
        d = d.slice(0, i) + d.slice(i + 2);
        break;
      }
    }
  }
  if (d.length !== 10) return null;
  return "549" + d;
}

/** +54 9 11 2345-6789 (solo para mostrar) */
export function formatPhone(e164: string) {
  if (e164.startsWith("549") && e164.length === 13) {
    const n = e164.slice(3);
    const area = n.startsWith("11") ? 2 : 3;
    return `+54 9 ${n.slice(0, area)} ${n.slice(area, n.length - 4)}-${n.slice(-4)}`;
  }
  return "+" + e164;
}

export function maskPhone(e164: string) {
  return "•••• " + e164.slice(-4);
}

export function maskEmail(email: string) {
  const [u, d] = email.split("@");
  return `${u.slice(0, 2)}•••@${d}`;
}
