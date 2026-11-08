import { expect, it } from "vitest";
import { apiHeaders } from "./authenticateRequest";

it.each(["https://web.ceyo.si", "https://app.ceyo.si"])("permits the production origin %s", (origin) => {
  expect(apiHeaders(new Request("https://web.ceyo.si/api/billing", { headers: { origin } }))["Access-Control-Allow-Origin"]).toBe(origin);
});
it("does not authorize unrelated origins", () => {
  expect(apiHeaders(new Request("https://web.ceyo.si/api/billing", { headers: { origin: "https://evil.example" } }))["Access-Control-Allow-Origin"]).toBeUndefined();
});