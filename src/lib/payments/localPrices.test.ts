import { describe, expect, it } from "vitest";
import { convertDisplayPrice, currencyForCountry } from "./localPrices";

describe("subscription local currency", () => {
  it("shows Egyptian prices in EGP", () => expect(currencyForCountry("EG")).toBe("EGP"));
  it("shows Saudi prices in SAR", () => expect(currencyForCountry("SA")).toBe("SAR"));
  it("shows UAE prices in AED", () => expect(currencyForCountry("AE")).toBe("AED"));
  it("shows euro-area prices in EUR", () => expect(currencyForCountry("DE")).toBe("EUR"));
  it("converts Plus monthly to local currency without changing its USD base", () => expect(convertDisplayPrice(20, "SAR", { SAR: 3.75 })).toBe(75));
  it("converts Plus yearly independently", () => expect(convertDisplayPrice(199, "SAR", { SAR: 3.75 })).toBe(746.25));
  it("respects three-decimal currencies", () => expect(convertDisplayPrice(20, "KWD", { KWD: 0.30678 })).toBe(6.136));
  it("rejects unavailable exchange rates instead of mislabelling USD", () => expect(() => convertDisplayPrice(20, "SAR", {})).toThrow());
});