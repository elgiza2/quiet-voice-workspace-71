import { createFileRoute } from "@tanstack/react-router";

/** Kashier server webhook. Trust comes only from the HMAC signature; the order is settled once. */
export const Route = createFileRoute("/api/public/kashier-webhook")({ server: { handlers: {
  POST: async ({ request }) => {
    const raw = await request.text();
    if (raw.length > 64_000) return new Response("Too large", { status: 413 });
    const { handleKashierWebhook } = await import("@/lib/payments/kashier.server");
    try {
      const result = await handleKashierWebhook(raw, request.headers.get("x-kashier-signature")?.trim() ?? "");
      return new Response(result.ok ? "ok" : "invalid signature", { status: result.status });
    } catch {
      return new Response("error", { status: 400 });
    }
  },
} } });
