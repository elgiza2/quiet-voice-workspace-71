import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearPageStates, PAGE_STATE_PREFIX, readPageState, syncPageStateOwner, writePageState } from "./pageStateCache";
describe("safe page state", () => {
  beforeEach(() => { localStorage.clear(); vi.useRealTimers(); });
  it("separates accounts and skips unknown owners", () => {
    writePageState("a", "/settings/plans", { tab: 2 });
    expect(readPageState("a", "/settings/plans")).toEqual({ tab: 2 });
    expect(readPageState("b", "/settings/plans")).toBeNull();
    expect(readPageState(null, "/settings/plans")).toBeNull();
  });
  it("expires after 24 hours", () => {
    vi.useFakeTimers(); writePageState("a", "/settings", { scrollTop: 50 });
    vi.advanceTimersByTime(86_400_000); expect(readPageState("a", "/settings")).toBeNull();
  });
  it("rejects sensitive paths and arbitrary payloads", () => {
    for (const path of ["/wallet", "/settings/vault", "/chat", "/?chat=bot:1"]) writePageState("a", path, { tab: 1 });
    writePageState("a", "/settings", { token: "not-allowed" } as never);
    expect(Object.keys(localStorage)).toHaveLength(0);
  });
  it("rejects malformed, foreign-owner and version-mismatched entries", () => {
    const key = PAGE_STATE_PREFIX + "a:/settings";
    for (const raw of ["broken", JSON.stringify({ version: 2, owner: "a", at: Date.now(), value: {} }), JSON.stringify({ version: 1, owner: "b", at: Date.now(), value: {} })]) {
      localStorage.setItem(key, raw); expect(readPageState("a", "/settings")).toBeNull(); expect(localStorage.getItem(key)).toBeNull();
    }
  });
  it("clears page state without clearing auth or vault", () => {
    localStorage.setItem("sb-session", "untouched"); localStorage.setItem("ceyo_vault_v1:a", "untouched");
    writePageState("a", "/settings", { scrollTop: 10 }); clearPageStates();
    expect(readPageState("a", "/settings")).toBeNull(); expect(localStorage.getItem("sb-session")).toBe("untouched"); expect(localStorage.getItem("ceyo_vault_v1:a")).toBe("untouched");
  });
  it("works when storage is unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => writePageState("a", "/settings", { tab: 1 })).not.toThrow(); spy.mockRestore();
  });
  it("clears on account switch and sign-out, not token refresh", () => {
    writePageState("a", "/settings", { tab: 1 }); syncPageStateOwner("a", "a");
    expect(readPageState("a", "/settings")).toEqual({ tab: 1 });
    syncPageStateOwner("a", "b"); expect(readPageState("a", "/settings")).toBeNull();
    writePageState("b", "/settings", { tab: 2 }); syncPageStateOwner("b", null);
    expect(readPageState("b", "/settings")).toBeNull();
  });
  it("bounds entries to 32", () => {
    for (let i = 0; i < 50; i++) writePageState(`owner-${i}`, "/settings", { tab: 0 });
    expect(Object.keys(localStorage).filter(k => k.startsWith(PAGE_STATE_PREFIX))).toHaveLength(32);
  });
  it("retains the same owner's saved state after a reload but discards other owners", () => {
    writePageState("a", "/settings", { tab: 1 }); writePageState("b", "/settings", { tab: 2 });
    syncPageStateOwner(null, "a");
    expect(readPageState("a", "/settings")).toEqual({ tab: 1 }); expect(readPageState("b", "/settings")).toBeNull();
  });
});