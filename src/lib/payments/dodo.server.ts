/** Server-only Dodo Payments: hosted checkout for non-Egypt web users, confirmed by asking Dodo directly. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { priceOf, type BillingInterval, type Tier } from "./plans";
import { DODO_PRODUCTS } from "./regions";
import { PaymentsUnavailable } from "./kashier.server";

const db = () => supabaseAdmin as any;
const base = () => ((process.env.DODO_MODE || "live") === "test" ? "https://test.dodopayments.com" : "https://live.dodopayments.com");

async function dodo(path: string, init: RequestInit = {}) {
  const key = process.env.DODO_PAYMENTS_API_KEY;
  if (!key) throw new PaymentsUnavailable("Dodo is not configured");
  const r = await fetch(`${base()}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { message?: string }).message || `Dodo error ${r.status}`);
  return j as Record<string, unknown>;
}

export async function createDodoCheckout(userId: string, email: string, tier: string, interval: string, country: string, origin: string) {
  const usd = priceOf(tier, interval);
  const product = DODO_PRODUCTS[`${tier as Tier}_${interval as BillingInterval}`];
  if (usd === null || !product) throw new Error("This plan is not available");
  const orderId = `ceyo_${crypto.randomUUID().replace(/-/g, "")}`;
  const { error } = await db().from("payment_orders").insert({ id: orderId, user_id: userId, tier, interval, amount: usd, currency: "USD", usd_amount: usd, provider: "dodo", method: "dodo" });
  if (error) throw new Error(error.message);
  const session = await dodo("/checkouts", { method: "POST", body: JSON.stringify({
    product_cart: [{ product_id: product, quantity: 1 }],
    customer: email ? { email } : undefined,
    billing_address: /^[A-Z]{2}$/.test(country) ? { country } : undefined,
    metadata: { order_id: orderId, user_id: userId },
    return_url: `${origin}/settings/plans?order=${orderId}`,
  }) });
  await db().from("payment_orders").update({ checkout_ref: session.session_id }).eq("id", orderId);
  return { orderId, url: String(session.checkout_url) };
}

/** Poll Dodo for the session's payment; only a succeeded payment from Dodo itself settles the order. */
export async function confirmDodo(userId: string, orderId: string) {
  const { data: o } = await db().from("payment_orders").select("id,status,user_id,checkout_ref").eq("id", orderId).maybeSingle();
  if (!o || o.user_id !== userId) throw new Error("Order not found");
  if (o.status !== "pending" || !o.checkout_ref) return { status: o.status };
  const s = await dodo(`/checkouts/${encodeURIComponent(o.checkout_ref)}`);
  const st = String(s.payment_status ?? "");
  if (st === "succeeded" && s.payment_id) {
    await db().rpc("settle_payment_order", { p_order: orderId, p_ref: String(s.payment_id) });
    return { status: "paid" };
  }
  if (st === "failed" || st === "cancelled") {
    await db().from("payment_orders").update({ status: "failed" }).eq("id", orderId).eq("status", "pending");
    return { status: "failed" };
  }
  return { status: "pending" };
}
