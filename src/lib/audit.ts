import { db, type Tx } from "@/db";
import { auditLog } from "@/db/schema";

export type Actor = { type: "admin" | "patient" | "system" | "google"; id?: string | null };

/** Registro de acciones importantes. No guardar datos personales en `details`. */
export async function audit(
  actor: Actor,
  action: string,
  entity?: string,
  entityId?: string | number | null,
  details?: Record<string, unknown>,
  tx?: Tx,
) {
  await (tx ?? db).insert(auditLog).values({
    actorType: actor.type,
    actorId: actor.id ?? null,
    action,
    entity,
    entityId: entityId == null ? null : String(entityId),
    details,
  });
}
