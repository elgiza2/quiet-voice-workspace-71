import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "test-only" } } }) } } }));
import { getSpeech, getVoices } from "./voiceClient";
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
it("quota failures still reject synthesis rather than returning audio", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Cartesia credit or request limit reached. Check your Cartesia account." }, { status: 402 })));
  await expect(getSpeech("test", "test-voice", "en")).rejects.toBeInstanceOf(Error);
});
it("quota failures still reject voice catalogue loading", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Cartesia credit or request limit reached. Check your Cartesia account." }, { status: 429 })));
  await expect(getVoices()).rejects.toBeInstanceOf(Error);
});