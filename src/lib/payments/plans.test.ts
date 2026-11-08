import { describe, expect, it } from "vitest";
import { priceOf } from "./plans";

describe("plan prices", () => {
  it("Plus costs $20 monthly", () => expect(priceOf("plus", "monthly")).toBe(20));
  it("Plus costs $199 yearly", () => expect(priceOf("plus", "yearly")).toBe(199));
  it("Pro costs $60 monthly", () => expect(priceOf("pro", "monthly")).toBe(60));
  it("Ultra costs $120 monthly", () => expect(priceOf("ultra", "monthly")).toBe(120));
  it("Pro is not sold yearly", () => expect(priceOf("pro", "yearly")).toBeNull());
  it("unknown tiers are rejected", () => expect(priceOf("free", "monthly")).toBeNull());
});
