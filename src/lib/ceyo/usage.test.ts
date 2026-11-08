import { afterEach, describe, expect, it, vi } from "vitest";
import { usagePercent } from "./usage";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc } }));
import { chargeUsage, checkUsageAvailable, usageFailure } from "./usage.server";
import { createClient } from "@supabase/supabase-js";
const balance = { plan: "free", isPaid: false, allowanceUsd: 0.05, spentUsd: 0, remainingUsd: 0.05, stepUsd: 0.01 };
describe("Usage percentage", () => {
  it.each([10, 20, 50, 70, 90, 100])("reports %i percent without converting it into credits", (percentage) => {
    expect(usagePercent({ ...balance, spentUsd: 0.05 * percentage / 100 })).toBe(percentage);
  });
  it("bounds usage at 100 percent", () => { expect(usagePercent({ ...balance, spentUsd: 0.06 })).toBe(100); });
});
describe("Usage enforcement", () => {
  afterEach(() => vi.clearAllMocks());
  it("stops an exhausted account instead of invoking more AI", async () => {
    rpc.mockResolvedValue({ data: { ok: false, code: "balance_exhausted" }, error: null });
    await expect(chargeUsage("owner", "operation")).rejects.toThrow("Usage limit reached");
    expect(rpc).toHaveBeenCalledWith("charge_agent_usage", { p_user_id: "owner", p_operation_key: "operation" });
  });
  it("fails closed on a missing accounting service", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(chargeUsage("owner", "operation")).rejects.toThrow("Could not check usage");
  });
  it("rejects exhausted access-token requests before provider work", async () => {
    const db = createClient("https://example.supabase.co", "test");
    vi.spyOn(db, "rpc").mockResolvedValue({ data: { isPaid: false, remainingUsd: 0, stepUsd: 0.01 }, error: null, count: null, status: 200, statusText: "OK" });
    await expect(checkUsageAvailable(db)).rejects.toThrow("Usage limit reached");
  });
  it("allows a free user with remaining usage", async () => {
    const db = createClient("https://example.supabase.co", "test");
    vi.spyOn(db, "rpc").mockResolvedValue({ data: { isPaid: false, remainingUsd: 0.01, stepUsd: 0.01 }, error: null, count: null, status: 200, statusText: "OK" });
    await expect(checkUsageAvailable(db)).resolves.toBeUndefined();
  });
  it("does not disguise an accounting outage as exhaustion", () => {
    expect(usageFailure(new Error("Could not check usage")).status).toBe(503);
    expect(usageFailure(new Error("Usage limit reached. Subscribe to continue.")).status).toBe(402);
  });
});