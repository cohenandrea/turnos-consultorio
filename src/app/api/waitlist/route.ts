import { handle, clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { waitlistSchema } from "@/lib/validation";
import { joinWaitlist } from "@/lib/services/waitlist";
import { getSettings } from "@/lib/services/config";
import { localToMs } from "@/lib/time";
import { AppError } from "@/lib/errors";

export async function POST(req: Request) {
  return handle(async () => {
    const s = await getSettings();
    if (!s.waitlistEnabled) throw new AppError("NOT_ALLOWED", "La lista de espera no está habilitada.");
    const d = waitlistSchema.parse(await req.json());
    await rateLimit(`waitlist:${clientIp(req)}`, 5, 3600);
    await joinWaitlist({
      ...d,
      wantsBefore: d.wantsBefore ? localToMs(d.wantsBefore, "23:59", s.timezone) : null,
    });
    return { ok: true };
  });
}
