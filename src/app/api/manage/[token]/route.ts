import { after } from "next/server";
import { z } from "zod";
import { handle, clientIp } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/ratelimit";
import { cancelAppointment, confirmAttendance, findByToken, rebookFromCancelled, rescheduleAppointment } from "@/lib/services/booking";
import { afterAppointmentChange } from "@/lib/services/jobs";
import { appointmentView } from "@/lib/services/views";

const body = z.object({
  action: z.enum(["confirm", "cancel", "reschedule", "rebook"]),
  start: z.iso.datetime().optional(),
  locationId: z.coerce.number().int().positive().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  return handle(async () => {
    const appt = await findByToken((await params).token);
    if (!appt) throw new AppError("NOT_FOUND", "El enlace no es válido o fue reemplazado.", 404);
    return { appointment: await appointmentView(appt) };
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  return handle(async () => {
    const { token } = await params;
    await rateLimit(`manage:${clientIp(req)}`, 30, 3600);
    const appt = await findByToken(token);
    if (!appt) throw new AppError("NOT_FOUND", "El enlace no es válido o fue reemplazado.", 404);
    const input = body.parse(await req.json());
    const actor = { type: "patient" as const, id: appt.patientId };
    switch (input.action) {
      case "confirm": {
        const a = await confirmAttendance(appt.id, actor);
        return { appointment: await appointmentView(a) };
      }
      case "cancel": {
        const a = await cancelAppointment(appt.id, actor, { enforcePolicy: true });
        after(() => afterAppointmentChange(a.id, { start: a.startAt, end: a.endAt }));
        return { appointment: await appointmentView(a) };
      }
      case "reschedule": {
        if (!input.start || !input.locationId) throw new AppError("INVALID_INPUT", "Elegí un nuevo horario.");
        const r = await rescheduleAppointment(appt.id, Date.parse(input.start), input.locationId, actor, { enforcePolicy: true });
        after(() => afterAppointmentChange(r.appointment.id, { start: r.previous.startAt, end: r.previous.endAt }));
        return { appointment: await appointmentView(r.appointment) };
      }
      case "rebook": {
        if (appt.status !== "cancelled") throw new AppError("INVALID_STATE", "Este turno sigue activo.");
        if (!input.start || !input.locationId) throw new AppError("INVALID_INPUT", "Elegí un horario.");
        const r = await rebookFromCancelled(appt, Date.parse(input.start), input.locationId);
        after(() => afterAppointmentChange(r.appointment.id));
        return { token: r.token, appointment: await appointmentView(r.appointment) };
      }
    }
  });
}
