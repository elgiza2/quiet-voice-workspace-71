import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/voice-transcribe")({ server: { handlers: {
  POST: async ({ request }) => {
    const { authenticate } = await import("@/lib/ceyo/auth.server");
    const auth = await authenticate(request).catch(() => null);
    if (!auth) return Response.json({ error: "Please sign in" }, { status: 401 });
    const { checkUsageAvailable, usageFailure } = await import("@/lib/ceyo/usage.server");
    try { await checkUsageAvailable(auth.db); } catch (error) { return usageFailure(error); }
    try {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof Blob) || !file.size || file.size > 20 * 1024 * 1024 || !/^(audio|video)\//.test(file.type))
        return Response.json({ error: "Upload an audio recording smaller than 20 MB." }, { status: 400 });
      const key = await (await import("@/lib/keys/providerKey")).getProviderKey("deepgram");
      if (!key) return Response.json({ error: "Recording transcription is not connected" }, { status: 503 });
      const { chargeUsage } = await import("@/lib/ceyo/usage.server");
      try { await chargeUsage(auth.userId, `transcribe:${crypto.randomUUID()}`); } catch (error) { return usageFailure(error); }
      const { transcribeOriginalRecording } = await import("@/lib/audio/recordingTranscription.server");
      return await transcribeOriginalRecording(file, key, request.signal);
    } catch { return Response.json({ error: "Could not transcribe the recording." }, { status: 502 }); }
  },
} } });