import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("assign"), botId: z.string().uuid() }),
  z.object({ action: z.literal("release"), botId: z.string().uuid() }),
]);

/** Signed-in phone actions: sync call results, give an agent a number, or release it. */
export const Route = createFileRoute("/api/phone")({ server: { handlers: {
  POST: async ({ request }) => {
    const { authenticate } = await import("@/lib/ceyo/auth.server");
    const auth = await authenticate(request).catch(() => null);
    if (!auth) return new Response("Unauthorized", { status: 401 });
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return new Response("Invalid request", { status: 400 });
    const phone = await import("@/lib/phone/telnyx.server");
    try {
      const input = parsed.data;
      if (input.action === "sync") return Response.json({ changed: await phone.syncPhoneCalls(auth.userId) });
      if (input.action === "assign") return Response.json({ number: await phone.assignNumber(auth.userId, input.botId) });
      await phone.releaseNumber(auth.userId, input.botId);
      return Response.json({ ok: true });
    } catch (e) {
      const message = e instanceof phone.PhoneUnavailable ? "Phone calls are not available right now" : (e as Error).message;
      return Response.json({ error: message.slice(0, 300) }, { status: e instanceof phone.PhoneUnavailable ? 503 : 400 });
    }
  },
} } });
