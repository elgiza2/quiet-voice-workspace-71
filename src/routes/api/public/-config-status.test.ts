import { describe, expect, it } from "vitest";
import { configStatus } from "./config-status";

describe("configStatus", () => {
  it("reports a missing service role key without exposing values", () => {
    const r = configStatus({ SUPABASE_URL: "https://x", SUPABASE_SERVICE_ROLE_KEY: "" });
    expect(r.ready).toBe(false);
    expect(r.settings.SUPABASE_SERVICE_ROLE_KEY).toBe(false);
    expect(r.settings.SUPABASE_URL).toBe(true);
    expect(JSON.stringify(r)).not.toContain("https://x");
  });
});
