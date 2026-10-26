export const PLACEHOLDERS = ["nombre", "profesional", "fecha", "hora", "direccion", "link", "codigo"] as const;
export type TemplateVars = Partial<Record<(typeof PLACEHOLDERS)[number], string>>;

/** Reemplaza {nombre}, {fecha}, etc. */
export function renderTemplate(body: string, vars: TemplateVars) {
  return body.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? (vars as Record<string, string>)[k] ?? "" : m));
}

/** Variables en el orden en que aparecen: define el orden de {{1}}, {{2}}… en WhatsApp. */
export function placeholderOrder(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/\{(\w+)\}/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Texto listo para cargar en Meta como plantilla (con {{1}}, {{2}}…). */
export function toMetaTemplate(body: string) {
  const order = placeholderOrder(body);
  return body.replace(/\{(\w+)\}/g, (_m, k: string) => `{{${order.indexOf(k) + 1}}}`);
}
