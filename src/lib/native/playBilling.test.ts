import { describe, expect, it, vi } from "vitest";
const platform = vi.hoisted(() => ({ native: false, name: "web" }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => platform.native, getPlatform: () => platform.name },
  registerPlugin: () => ({}),
}));
import { isPlayApp } from "./playBilling";
describe("Google Play-only Android payment boundary", () => {
  it("uses Play billing inside the native Android app", () => {
    platform.native = true; platform.name = "android";
    expect(isPlayApp()).toBe(true);
  });
  it("does not treat an ordinary website as a Play app", () => {
    platform.native = false; platform.name = "web";
    expect(isPlayApp()).toBe(false);
  });
});