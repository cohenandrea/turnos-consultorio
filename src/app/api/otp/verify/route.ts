import { z } from "zod";
import { handle, clientIp } from "@/lib/http";
import { verifyOtp } from "@/lib/services/otp";

const body = z.object({ channel: z.enum(["email", "whatsapp"]), value: z.string().min(3).max(120), code: z.string().regex(/^\d{6}$/, "El código tiene 6 números.") });

export async function POST(req: Request) {
  return handle(async () => {
    const { channel, value, code } = body.parse(await req.json());
    return verifyOtp(channel, value, code, clientIp(req));
  });
}
