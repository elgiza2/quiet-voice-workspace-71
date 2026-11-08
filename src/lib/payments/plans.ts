/** Browser-safe plan prices (USD). The server prices every order from here, never from the browser. */
export type Tier = "plus" | "pro" | "ultra";
export type BillingInterval = "monthly" | "yearly";

export const PLAN_PRICES: Record<Tier, Partial<Record<BillingInterval, number>>> = {
  plus: { monthly: 20, yearly: 199 },
  pro: { monthly: 60 },
  ultra: { monthly: 120 },
};

/** Price for a tier/interval, or null when that combination is not sold. */
export function priceOf(tier: string, interval: string): number | null {
  const row = PLAN_PRICES[tier as Tier];
  const value = row?.[interval as BillingInterval];
  return typeof value === "number" ? value : null;
}

/** Google Play product id for a tier/interval (configure the same ids in Play Console). */
export const playProductId = (tier: Tier, interval: BillingInterval) => `ceyo_${tier}_${interval}`;
