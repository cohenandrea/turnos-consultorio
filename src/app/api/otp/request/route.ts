import { z } from "zod";
import { handle, clientIp } from "@/lib/http";
import { requestOtp } from "@/lib/services/otp";

const body = z.object({ channel: z.enum(["email", "whatsapp"]), value: z.string().min(3).max(120) });

export async function POST(req: Request) {
  return handle(async () => {
    const { channel, value } = body.parse(await req.json());
    return requestOtp(channel, value, clientIp(req));
  });
}
