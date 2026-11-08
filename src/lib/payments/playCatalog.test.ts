import { describe, expect, it } from "vitest";
import { PLAY_CATALOG, playOfferPayload } from "./playCatalog";
describe("Play first-month subscription promotion", () => {
  it("charges half of the existing monthly prices for the first month", () => {
    expect(PLAY_CATALOG.filter(p => p.interval === "monthly").map(p => [p.introductoryUsd, p.recurringUsd])).toEqual([[10, 20], [30, 60], [60, 120]]);
  });
  it("discounts 50 percent for exactly one one-month phase", () => {
    const offer = playOfferPayload("ceyo_plus_monthly", ["US", "EG"]);
    expect(offer.phases).toEqual([{ duration: "P1M", recurrenceCount: 1, regionalConfigs: [{ regionCode: "US", relativeDiscount: 0.5 }, { regionCode: "EG", relativeDiscount: 0.5 }] }]);
  });
  it("leaves the annual subscription undiscounted", () => {
    expect(PLAY_CATALOG.find(p => p.productId === "ceyo_plus_yearly")?.recurringUsd).toBe(199);
    expect(() => playOfferPayload("ceyo_plus_yearly", ["US"])).toThrow();
  });
  it("requires a new subscriber to prevent repeated first-month discounts", () => {
    expect(playOfferPayload("ceyo_pro_monthly", ["US"]).targeting).toEqual({ acquisitionRule: { scope: { anySubscriptionInApp: {} } } });
  });
});