import { after } from "next/server";
import { handle, clientIp } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { isWhatsAppConfigured } from "@/lib/env";
import { rateLimit } from "@/lib/ratelimit";
import { bookingSchema } from "@/lib/validation";
import { readPatientVerification } from "@/lib/patient-verify";
import { bookAppointment } from "@/lib/services/booking";
import { resolveCoverageAndType } from "@/lib/services/config";
import { afterAppointmentChange } from "@/lib/services/jobs";
import { appointmentView } from "@/lib/services/views";

export async function POST(req: Request) {
  return handle(async () => {
    const data = bookingSchema.parse(await req.json());
    await rateLimit(`book:${clientIp(req)}`, 8, 3600);
    const { coverage } = await resolveCoverageAndType(data.coverageId, data.consultationTypeId);
    if (!isWhatsAppConfigured() && !data.email) throw new AppError("INVALID_INPUT", "Ingresá tu correo electrónico para recibir la confirmación.");
    if (coverage.requiresBirthDate && !data.birthDate) throw new AppError("INVALID_INPUT", "Ingresá tu fecha de nacimiento.");
    const verifiedPatientId = await readPatientVerification(data.verificationToken);
    const { appointment, token } = await bookAppointment({
      coverageId: data.coverageId,
      consultationTypeId: data.consultationTypeId,
      locationId: data.locationId,
      start: Date.parse(data.start),
      patient: {
        fullName: data.fullName,
        dni: data.dni,
        phone: data.phone,
        email: data.email,
        birthDate: data.birthDate,
        memberNumber: coverage.requiresMemberNumber ? data.memberNumber : null,
      },
      consentReminders: data.consentReminders,
      privacyAccepted: data.privacyAccepted,
      verifiedPatientId,
      source: "web",
      actor: { type: "patient" },
    });
    after(() => afterAppointmentChange(appointment.id));
    return { token, appointment: await appointmentView(appointment) };
  });
}
