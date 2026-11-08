import { act, render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ channel: vi.fn(), remove: vi.fn(), seed: null as null | ((v: unknown) => void) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
  channel: fake.channel, removeChannel: fake.remove,
  from: () => { const query: Record<string, unknown> = {}; for (const method of ["select", "eq", "in", "gte"]) query[method] = () => query;
    query.limit = () => new Promise((resolve) => { fake.seed = resolve; }); return query; },
} }));
vi.mock("@/lib/notifyJobComplete", () => ({ notifyJobComplete: vi.fn() }));
import Notifier from "./BackgroundJobNotifier";

beforeEach(() => { fake.channel.mockReset(); fake.remove.mockReset(); fake.seed = null; });
it("does not subscribe after unmount while the initial seed request is pending", async () => {
  const view = render(<Notifier />);
  await act(async () => { await Promise.resolve(); });
  expect(fake.seed).not.toBeNull();
  view.unmount();
  await act(async () => { fake.seed?.({ data: [] }); await Promise.resolve(); });
  expect(fake.channel).not.toHaveBeenCalled();
});