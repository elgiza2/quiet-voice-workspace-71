import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const input = z.object({
  agentName: z.string().max(120).default("Assistant"),
  agentPrompt: z.string().max(6000).default(""),
  language: z.string().max(12).default("en"),
  reason: z.string().max(2000).default(""),
});
const noStore = { "Cache-Control": "no-store" };

/** Issues a short-lived Anam session token for a face-to-face video call with one of the user's bots. */
async function handle(request: Request) {
  const { authenticate } = await import("@/lib/ceyo/auth.server");
  const auth = await authenticate(request).catch(() => null);
  if (!auth) return Response.json({ error: "Please sign in" }, { status: 401, headers: noStore });
  const { getUsageStatus, usageFailure } = await import("@/lib/ceyo/usage.server");
  let isPaid: boolean;
  try { isPaid = (await getUsageStatus(auth.db)).isPaid; } catch (error) { return usageFailure(error); }
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid call" }, { status: 400, headers: noStore });
  const { agentName, agentPrompt, language, reason } = parsed.data;
  const { getProviderKey } = await import("@/lib/keys/providerKey");
  const key = await getProviderKey("anam");
  if (!key) return Response.json({ error: "Video calls are not connected" }, { status: 503, headers: noStore });
  const { callLanguage } = await import("@/lib/calls/callLanguage.server");
  const lang = await callLanguage(auth.db, auth.userId, language);
  const systemPrompt = [
    `You are ${agentName}, on a live video call with the user.`,
    agentPrompt,
    reason ? `You placed this call. Reason: ${reason}. Start by greeting the user and telling them why you called.` : "",
    "You can see the user: context notes starting with [You see the user's camera] or [You see the user's shared screen] describe what is in front of you right now. Treat them as your own eyesight, refer to them naturally when relevant, and never mention notes or descriptions.",
    lang === "ar"
      ? "Always speak Arabic, in the user's dialect (Egyptian Arabic if they use it). Never switch to English, Spanish or any other language unless the user does."
      : `Always speak the user's language (${lang}) and never switch languages unless the user does.`,
    "This is a spoken video call: answer in one to three short natural sentences, no lists or markdown.",
  ].filter(Boolean).join("\n\n");
  const createSessionToken = (limitToFreeMinute: boolean) => fetch("https://api.anam.ai/v1/auth/session-token", {
    method: "POST", signal: request.signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      maxSessions: 1,
      expiresInSeconds: 120,
      personaConfig: {
        name: agentName,
        avatarId: "071b0286-4cce-4808-bee2-e642f1062de3",
        avatarModel: "cara-4",
        voiceId: "de23e340-1416-4dd8-977d-065a7ca11697",
        llmId: "a7cf662c-2ace-4de1-a21e-ef0fbf144bb7",
        systemPrompt,
        ...(limitToFreeMinute ? { maxSessionLengthSeconds: 60 } : {}),
        languageCode: lang,
        // Anam's own recognizer understands every language; the platform default can be English-only.
        voiceDetectionOptions: { sttProvider: "anam", endOfSpeechSensitivity: 0.5, silenceBeforeSkipTurnSeconds: 0, silenceBeforeSessionEndSeconds: 300, silenceBeforeAutoEndTurnSeconds: 1.2 },
      },
    }),
  });
  let res = await createSessionToken(!isPaid);
  if (!res.ok) console.error("anam session-token", res.status, (await res.clone().text()).slice(0, 300));
  if (!res.ok) return Response.json({ error: res.status === 402 || res.status === 429 ? "Video call limit reached on the Anam account." : "Video service unavailable" }, { status: 502, headers: noStore });
  let { sessionToken } = await res.json() as { sessionToken?: string };
  if (!sessionToken) return Response.json({ error: "Video service unavailable" }, { status: 502, headers: noStore });
  const { data: quota, error: quotaError } = await auth.db.rpc("reserve_free_video_call_minute");
  if (quotaError || !quota || typeof quota !== "object" || Array.isArray(quota) || typeof quota.allowed !== "boolean" || typeof quota.isPaid !== "boolean") {
    return Response.json({ error: "Could not check the daily video-call allowance. Please try again." }, { status: 503, headers: noStore });
  }
  if (!quota.allowed) {
    return Response.json({ error: lang === "ar" ? "خلصت دقيقة الفيديو المجانية لليوم. تقدر تستخدمها تاني بعد منتصف الليل بتوقيت القاهرة." : "Your free daily video minute has been used. It resets at midnight Cairo time.", code: "daily_video_limit" }, { status: 429, headers: noStore });
  }
  // If a paid plan expired while Anam was issuing the first token, replace it with a limited token.
  if (isPaid && !quota.isPaid) {
    res = await createSessionToken(true);
    if (!res.ok) return Response.json({ error: "Video service unavailable" }, { status: 502, headers: noStore });
    ({ sessionToken } = await res.json() as { sessionToken?: string });
    if (!sessionToken) return Response.json({ error: "Video service unavailable" }, { status: 502, headers: noStore });
  }
  const maxSessionLengthSeconds = isPaid && quota.isPaid ? null : 60;
  return Response.json({ sessionToken, language: lang, maxSessionLengthSeconds }, { headers: noStore });
}

export const Route = createFileRoute("/api/video-call")({ server: { handlers: { POST: ({ request }) => handle(request) } } });
