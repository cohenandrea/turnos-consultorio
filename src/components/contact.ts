export function contactMailto(email: string) {
  return `mailto:${email}?subject=${encodeURIComponent("Pedido de información")}`;
}
