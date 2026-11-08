import { expect, it } from "vitest";
import { absoluteAuthRedirect } from "./authNavigation";

it("returns OAuth to the public auth page while preserving the intended destination", () => {
  const url = new URL(absoluteAuthRedirect("/settings", ""));
  expect(url.origin).toBe(window.location.origin);
  expect(url.pathname).toBe("/auth");
  expect(url.searchParams.get("redirect")).toBe("/settings");
  expect(url.searchParams.get("oauth")).toBe("1");
});
it("rejects an external post-login destination", () => {
  expect(new URL(absoluteAuthRedirect("https://evil.example", "")).searchParams.get("redirect")).toBe("/chat");
});