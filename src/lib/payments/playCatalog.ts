import { priceOf, playProductId, type Tier, type BillingInterval } from "./plans";

export const PLAY_FIRST_MONTH_OFFER = {
  offerId: "first-month-half", basePlanId: "monthly", duration: "P1M",
  recurrenceCount: 1, relativeDiscount: 0.5,
} as const;

export const PLAY_CATALOG = ([
  ["plus", "monthly", "Ceyo Plus"], ["plus", "yearly", "Ceyo Plus Annual"],
  ["pro", "monthly", "Ceyo Pro"], ["ultra", "monthly", "Ceyo Ultra"],
] as const).map(([tier, interval, title]) => ({
  tier: tier as Tier, interval: interval as BillingInterval, title,
  productId: playProductId(tier, interval), basePlanId: interval,
  billingPeriodDuration: interval === "monthly" ? "P1M" : "P1Y",
  recurringUsd: priceOf(tier, interval) ?? 0,
  introductoryUsd: interval === "monthly" ? (priceOf(tier, interval) ?? 0) * 0.5 : null,
}));

export function playOfferPayload(productId: string, regions: string[]) {
  if (!PLAY_CATALOG.some(p => p.productId === productId && p.interval === "monthly")) throw new Error("No monthly introductory offer for this product");
  if (!regions.length) throw new Error("Offer regions required");
  return {
    packageName: "si.ceyo.app", productId, basePlanId: PLAY_FIRST_MONTH_OFFER.basePlanId,
    offerId: PLAY_FIRST_MONTH_OFFER.offerId,
    targeting: { acquisitionRule: { scope: { anySubscriptionInApp: {} } } },
    regionalConfigs: regions.map(regionCode => ({ regionCode, newSubscriberAvailability: true })),
    phases: [{ duration: "P1M", recurrenceCount: 1,
      regionalConfigs: regions.map(regionCode => ({ regionCode, relativeDiscount: 0.5 })),
    }],
  };
}