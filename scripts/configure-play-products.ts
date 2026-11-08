/** Operator-only. Dry run by default; --apply creates drafts, --activate makes them purchasable. */
import { SignJWT, importPKCS8 } from "jose";
import { PLAY_CATALOG, playOfferPayload } from "../src/lib/payments/playCatalog";

const apply = process.argv.includes("--apply");
const activate = process.argv.includes("--activate");
if (!apply) {
  console.log(JSON.stringify({ packageName: "si.ceyo.app", products: PLAY_CATALOG, offers: PLAY_CATALOG.filter(p => p.interval === "monthly").map(p => playOfferPayload(p.productId, ["US"])) }, null, 2));
} else {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT;
  if (!raw) throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT must be supplied securely; no products changed.");
  const sa = JSON.parse(raw);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/androidpublisher" })
    .setProtectedHeader({ alg: "RS256" }).setIssuer(sa.client_email).setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt().setExpirationTime("1h").sign(await importPKCS8(sa.private_key, "RS256"));
  const login = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!login.ok) throw new Error("Google operator authorization failed");
  const { access_token } = await login.json();
  if (!access_token) throw new Error("Google operator authorization unavailable");
  const root = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/si.ceyo.app";
  async function request(path: string, method = "GET", body?: unknown) {
    const res = await fetch(root + path, { method, headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (res.status === 404 && method === "GET") return null;
    if (!res.ok) throw new Error(`Play configuration request failed (${res.status}); partial changes may exist. Re-run safely after correcting permissions/configuration.`);
    return res.json();
  }
  for (const p of PLAY_CATALOG) {
    const path = `/subscriptions/${p.productId}`;
    let subscription = await request(path);
    if (!subscription) {
      const prices = await request("/pricing:convertRegionPrices", "POST", { price: { currencyCode: "USD", units: String(p.recurringUsd), nanos: 0 } });
      const regionalConfigs = Object.entries(prices.convertedRegionPrices).map(([regionCode, row]: [string, any]) => ({ regionCode, price: row.price, newSubscriberAvailability: true }));
      subscription = await request(`/subscriptions?${new URLSearchParams({ productId: p.productId, "regionsVersion.version": prices.regionVersion.version })}`, "POST", {
        packageName: "si.ceyo.app", productId: p.productId,
        listings: [{ languageCode: "en-US", title: p.title, description: p.interval === "monthly" ? "Auto-renewing monthly subscription. Eligible new subscribers get 50% off the first month, then regular pricing." : "Auto-renewing annual subscription. Billed yearly at the regular price." }],
        basePlans: [{ basePlanId: p.basePlanId, autoRenewingBasePlanType: { billingPeriodDuration: p.billingPeriodDuration, resubscribeState: "RESUBSCRIBE_STATE_ACTIVE" }, regionalConfigs }],
      });
    }
    const base = subscription.basePlans?.find((b: any) => b.basePlanId === p.basePlanId);
    if (!base || base.autoRenewingBasePlanType?.billingPeriodDuration !== p.billingPeriodDuration) throw new Error(`Existing product ${p.productId} does not match the expected recurring plan; not overwritten.`);
    if (activate && base.state !== "ACTIVE") await request(`${path}/basePlans/${p.basePlanId}:activate`, "POST", {});
    if (p.interval === "monthly") {
      const offerPath = `${path}/basePlans/monthly/offers/first-month-half`;
      let offer = await request(offerPath);
      const regions = base.regionalConfigs.filter((r: any) => r.newSubscriberAvailability).map((r: any) => r.regionCode);
      if (!offer) {
        const prices = await request("/pricing:convertRegionPrices", "POST", { price: { currencyCode: "USD", units: String(p.recurringUsd), nanos: 0 } });
        offer = await request(`${path}/basePlans/monthly/offers?${new URLSearchParams({ offerId: "first-month-half", "regionsVersion.version": prices.regionVersion.version })}`, "POST", playOfferPayload(p.productId, regions));
      }
      if (offer.phases?.length !== 1 || offer.phases[0].duration !== "P1M" || offer.phases[0].recurrenceCount !== 1 || !offer.phases[0].regionalConfigs.every((r: any) => r.relativeDiscount === 0.5) || !offer.targeting?.acquisitionRule?.scope?.anySubscriptionInApp) throw new Error(`Existing offer ${p.productId} differs from the first-month rule; not activated.`);
      if (activate && offer.state !== "ACTIVE") await request(`${offerPath}:activate`, "POST", {});
    }
    console.log(`${p.productId}: ${activate ? "active configuration verified" : "draft configuration prepared"}`);
  }
}