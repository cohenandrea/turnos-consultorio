import { DateTime } from "luxon";
import { handle } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { findByToken } from "@/lib/services/booking";
import { bookingWindow, findSlots, serializeSlot, suggestSlots } from "@/lib/services/availability-service";
import { getActiveLocations, getSettings } from "@/lib/services/config";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const p = new URL(req.url).searchParams;
    let coverageId = Number(p.get("coverage"));
    let consultationTypeId = Number(p.get("type"));
    let excludeAppointmentId: string | undefined;
    const token = p.get("token");
    if (token) {
      const appt = await findByToken(token);
      if (!appt) throw new AppError("NOT_FOUND", "El enlace no es válido.", 404);
      coverageId = appt.coverageId;
      consultationTypeId = appt.consultationTypeId;
      if (appt.status === "confirmed") excludeAppointmentId = appt.id;
    }
    if (!coverageId || !consultationTypeId) throw new AppError("INVALID_INPUT", "Faltan datos para buscar turnos.");
    const [s, locs] = await Promise.all([getSettings(), getActiveLocations()]);
    const names = new Map(locs.map((l) => [l.id, locs.length > 1 ? l.name : ""]));
    const now = Date.now();
    const win = bookingWindow(s, now);
    const range = {
      minMonth: DateTime.fromMillis(Math.max(now, win.opensAt ?? 0), { zone: s.timezone }).toFormat("yyyy-MM"),
      maxMonth: DateTime.fromMillis(win.horizon - 1, { zone: s.timezone }).toFormat("yyyy-MM"),
    };
    if (p.get("mode") === "month") {
      const month = DateTime.fromFormat(p.get("month") ?? "", "yyyy-MM", { zone: s.timezone });
      if (!month.isValid) throw new AppError("INVALID_INPUT", "Mes inválido.");
      const r = await findSlots({ coverageId, consultationTypeId, excludeAppointmentId, from: month.toMillis(), to: month.plus({ months: 1 }).toMillis() });
      const days: Record<string, ReturnType<typeof serializeSlot>[]> = {};
      for (const slot of r.slots) {
        const v = serializeSlot(slot, s.timezone, names);
        (days[v.dateKey] ??= []).push(v);
      }
      return { days, ...range };
    }
    const r = await suggestSlots({ coverageId, consultationTypeId, excludeAppointmentId });
    return { suggestions: r.suggestions.map((x) => serializeSlot(x, s.timezone, names)), hasAny: r.hasAny, ...range };
  });
}
