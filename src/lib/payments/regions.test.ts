import { describe, expect, it } from "vitest";
import { methodsFor, providerFor } from "./regions";

describe("web payment regions", () => {
  it("Egypt uses Kashier with card and Vodafone Cash only", () => {
    expect(providerFor("EG")).toBe("kashier");
    expect(methodsFor("EG")).toEqual(["Card", "Vodafone Cash"]);
  });
  it("other countries use Dodo", () => {
    expect(providerFor("US")).toBe("dodo");
    expect(providerFor("SA")).toBe("dodo");
  });
  it("India sees UPI through Dodo", () => expect(methodsFor("IN")).toContain("UPI"));
});
