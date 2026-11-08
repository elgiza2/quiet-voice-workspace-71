import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const plan = { tier: z.enum(["plus", "pro", "ultra"]), interval: z.enum(["monthly", "yearly"]) };
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("quote"), ...plan, tz: z.string().max(64).default("") }),
  z.object({ action: z.literal("kashier_card"), ...plan }),
  z.object({ action: z.literal("kashier_wallet"), ...plan, phone: z.string().min(8).max(20) }),
  z.object({ action: z.literal("kashier_wallet_check"), orderId: z.string().min(5).max(80) }),
  z.object({ action: z.literal("dodo"), ...plan, country: z.string().max(2).default("") }),
  z.object({ action: z.literal("dodo_check"), orderId: z.string().min(5).max(80) }),
  z.object({ action: z.literal("play"), ...plan, purchaseToken: z.string().min(10).max(4096) }),
]);

function countryOf(request: Request, tz: string, guess: (tz: string) => string | null) {
  const h = request.headers.get("cf-ipcountry") || request.headers.get("x-vercel-ip-country") || "";
  if (/^[A-Z]{2}$/.test(h) && h !== "XX") return h;
  return guess(tz) || "US";
}

/** Signed-in billing: Kashier Direct API (Egypt), Dodo checkout (rest of world), Google Play (Android). */
export const Route = createFileRoute("/api/billing")({ server: { handlers: {
  POST: async ({ request }) => {
    const { authenticate } = await import("@/lib/ceyo/auth.server");
    const auth = await authenticate(request).catch(() => null);
    if (!auth) return new Response("Unauthorized", { status: 401 });
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return new Response("Invalid request", { status: 400 });
    const k = await import("@/lib/payments/kashier.server");
    const origin = new URL(request.url).origin;
    const email = async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin.auth.admin.getUserById(auth.userId);
      return data.user?.email ?? "";
    };
    try {
      const i = parsed.data;
      switch (i.action) {
        case "quote": {
          const { providerFor, methodsFor, countryFromTimeZone } = await import("@/lib/payments/regions");
          const { priceOf } = await import("@/lib/payments/plans");
          const country = countryOf(request, i.tz, countryFromTimeZone);
          const usd = priceOf(i.tier, i.interval) ?? 0;
          const provider = providerFor(country);
          const local = provider === "kashier" ? { amount: await k.usdToEgp(usd), currency: "EGP" } : { amount: usd, currency: "USD" };
          return Response.json({ country, provider, methods: methodsFor(country), ...local });
        }
        case "kashier_card": return Response.json(await k.createKashierOrder(auth.userId, i.tier, i.interval, "card", origin));
        case "kashier_wallet": return Response.json(await k.requestKashierWallet(auth.userId, await email(), i.tier, i.interval, i.phone, origin));
        case "kashier_wallet_check": return Response.json(await k.reconcileKashierWallet(auth.userId, i.orderId));
        case "dodo": {
          const { createDodoCheckout } = await import("@/lib/payments/dodo.server");
          return Response.json(await createDodoCheckout(auth.userId, await email(), i.tier, i.interval, i.country.toUpperCase(), origin));
        }
        case "dodo_check": {
          const { confirmDodo } = await import("@/lib/payments/dodo.server");
          return Response.json(await confirmDodo(auth.userId, i.orderId));
        }
        case "play": {
          const { verifyPlayPurchase } = await import("@/lib/payments/googlePlay.server");
          return Response.json(await verifyPlayPurchase(auth.userId, i.tier, i.interval, i.purchaseToken));
        }
      }
    } catch (e) {
      const off = e instanceof k.PaymentsUnavailable;
      return Response.json({ error: off ? "Payments are not available right now" : (e as Error).message.slice(0, 200) }, { status: off ? 503 : 400, headers: { "cache-control": "no-store" } });
    }
  },
} } });
