import { DateTime } from "luxon";
import { getAdmin } from "@/lib/auth";
import { handle } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { findSlots } from "@/lib/services/availability-service";
import { getSettings } from "@/lib/services/config";
import { formatTime } from "@/lib/time";

export async function GET(req: Request) {
  return handle(async () => {
    if (!(await getAdmin())) throw new AppError("NOT_ALLOWED", "No autorizado", 401);
    const p = new URL(req.url).searchParams;
    const s = await getSettings();
    const day = DateTime.fromISO(p.get("date") ?? "", { zone: s.timezone }).startOf("day");
    if (!day.isValid) throw new AppError("INVALID_INPUT", "Fecha inválida");
    const r = await findSlots({
      coverageId: Number(p.get("coverage")),
      consultationTypeId: Number(p.get("type")),
      from: day.toMillis(),
      to: day.plus({ days: 1 }).toMillis(),
      ignoreNotice: true,
    });
    return { times: [...new Set(r.slots.map((x) => formatTime(x.start, s.timezone)))] };
  });
}
