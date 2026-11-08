import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const { authenticate } = await import("@/lib/ceyo/auth.server");
  const auth = await authenticate(request).catch(() => null);
  if (!auth) return Response.json({ error: "Please sign in" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { checkUsageAvailable, usageFailure, chargeUsage } = await import("@/lib/ceyo/usage.server");
  if (request.method === "POST") {
    try { await checkUsageAvailable(auth.db); } catch (error) { return usageFailure(error); }
  }
  const key = await (await import("@/lib/keys/providerKey")).getProviderKey("cartesia");
  if (!key) return Response.json({ error: "Cartesia is not connected" }, { status: 503 });
  try {
    const { voiceCatalogue, generateSpeech } = await import("@/lib/audio/cartesia.server");
    const body: unknown = request.method === "POST" ? await request.json().catch(() => null) : null;
    if (request.method === "POST") {
      const { speechInput } = await import("@/lib/audio/voiceSchema");
      if (!speechInput.safeParse(body).success) return Response.json({ error: "Invalid speech request" }, { status: 400 });
      try { await chargeUsage(auth.userId, `speech:${crypto.randomUUID()}`); } catch (error) { return usageFailure(error); }
    }
    return request.method === "GET" ? await voiceCatalogue(key, request.signal)
      : await generateSpeech(key, body, request.signal);
  } catch {
    return Response.json({ error: "Voice service unavailable. Please try again." }, { status: 502 });
  }
}

export const Route = createFileRoute("/api/voice")({ server: { handlers: {
  GET: ({ request }) => handle(request), POST: ({ request }) => handle(request),
} } });