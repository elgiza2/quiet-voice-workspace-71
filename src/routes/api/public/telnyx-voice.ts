import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/** Telnyx call events. The payload is never trusted: only the call-control id is used,
 *  and the call's real state and transcript are re-read from the Telnyx API. */
const Event = z.object({
  data: z.object({
    event_type: z.string().max(100),
    payload: z.object({ call_control_id: z.string().min(1).max(300).optional() }).passthrough(),
  }).passthrough(),
});

const FINISHING = new Set(["call.hangup", "call.conversation.ended", "call.conversation_insights.generated"]);

export const Route = createFileRoute("/api/public/telnyx-voice")({ server: { handlers: {
  POST: async ({ request }) => {
    const parsed = Event.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return new Response(null, { status: 204 });
    const { event_type, payload } = parsed.data.data;
    if (!FINISHING.has(event_type) || !payload.call_control_id) return new Response(null, { status: 204 });
    try {
      const { syncByCallControlId } = await import("@/lib/phone/telnyx.server");
      await syncByCallControlId(payload.call_control_id);
    } catch (e) {
      console.error("telnyx-voice sync failed", (e as Error).message);
    }
    return new Response(null, { status: 204 });
  },
} } });
