import { afterEach, describe, expect, it, vi } from "vitest";
import { readSetting, saveSetting } from "./settingsStorage";
describe("settings storage failures", () => {
  afterEach(() => vi.restoreAllMocks());
  it("keeps settings readable when device storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    expect(readSetting("ceyo_language")).toBeNull();
  });
  it("reports failed persistence rather than claiming a save", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(saveSetting("ceyo_language", "ar")).toBe(false);
  });
});