import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { nativeGoogleCode, NATIVE_GOOGLE_RETURN } from "./googleAuth";

describe("Android Google return boundary", () => {
  it("returns to the Android domain's public auth callback", () => {
    expect(NATIVE_GOOGLE_RETURN).toBe("https://app.ceyo.si/auth/native-return");
  });
  it("accepts a one-time code only at the exact app callback", () => {
    expect(nativeGoogleCode("ceyo://auth/callback?code=one-time-code")).toBe("one-time-code");
  });
  it("rejects other destinations and token-only callbacks", () => {
    for (const url of ["https://evil.example/?code=abc", "ceyo://other/callback?code=abc", "ceyo://auth/other?code=abc", "ceyo://auth/callback#access_token=abc"]) {
      expect(nativeGoogleCode(url)).toBeNull();
    }
  });
});