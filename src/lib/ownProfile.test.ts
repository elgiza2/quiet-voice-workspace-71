import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ select: vi.fn(), result: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { onAuthStateChange: vi.fn() }, from: () => ({ select: mocks.select }) } }));
import { getOwnProfile, invalidateOwnProfile } from "./ownProfile";
describe("current account schema", () => {
  beforeEach(() => { invalidateOwnProfile(); mocks.select.mockReturnValue({ eq: () => ({ maybeSingle: mocks.result }) }); });
  it("reads account identity without nonexistent credit or plan columns", async () => {
    mocks.result.mockResolvedValue({ data: { id: "owner", display_name: "Test", avatar_url: null }, error: null });
    expect((await getOwnProfile("owner"))?.display_name).toBe("Test");
    expect(mocks.select).toHaveBeenCalledWith("id, display_name, avatar_url");
  });
  it("allows retry after a failed account read", async () => {
    mocks.result.mockResolvedValueOnce({ data: null, error: { message: "offline" } }).mockResolvedValueOnce({ data: { id: "owner", display_name: "Recovered", avatar_url: null }, error: null });
    await expect(getOwnProfile("owner")).rejects.toThrow("Could not load account");
    expect((await getOwnProfile("owner"))?.display_name).toBe("Recovered");
  });
});