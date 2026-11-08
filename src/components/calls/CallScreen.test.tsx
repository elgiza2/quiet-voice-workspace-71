import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ clients: [] as any[], create: vi.fn(), session: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: sdk.session } } }));
vi.mock("@/pages/agent/hub/HubParts", () => ({ BotAvatar: () => null }));
vi.mock("@/pages/agent/hub/VoiceControls", () => ({ useVoiceChoice: () => ({}) }));
vi.mock("@anam-ai/js-sdk", () => ({ createClient: sdk.create, AnamEvent: { VIDEO_STREAM_STARTED: "video", AUDIO_STREAM_STARTED: "audio", VIDEO_PLAY_STARTED: "play", CONNECTION_CLOSED: "close", MIC_PERMISSION_DENIED: "denied", MESSAGE_HISTORY_UPDATED: "history" } }));
import { ActiveCallScreen } from "./CallScreen";
import { calls } from "@/lib/calls/callStore";
import type { AgentInfo } from "@/lib/agentsky/client";

afterEach(() => { cleanup(); calls.end(); vi.unstubAllGlobals(); vi.restoreAllMocks(); sdk.clients = []; sdk.create.mockReset(); });
describe("video call recovery", () => {
  it("starts once under StrictMode, attaches remote audio, and disposes before retry", async () => {
    sdk.session.mockResolvedValue({ data: { session: { access_token: "test-session" } } });
    sdk.create.mockImplementation(() => {
      const listeners: Record<string, (value?: any) => void> = {};
      const client = { addListener: (name: string, fn: (value?: any) => void) => { listeners[name] = fn; }, streamToVideoElement: vi.fn().mockResolvedValue(undefined), stopStreaming: vi.fn().mockResolvedValue(undefined), listeners };
      sdk.clients.push(client); return client;
    });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessionToken: "test-token" })));
    // A fresh response is needed on retry.
    fetcher.mockImplementation(async () => new Response(JSON.stringify({ sessionToken: "test-token" })));
    vi.stubGlobal("fetch", fetcher);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new Error("no camera")) } });
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    calls.start({ kind: "video", agent: { id: "bot", name: "Bot" } as AgentInfo, agentIds: ["bot"] });
    const screen = render(<StrictMode><ActiveCallScreen /></StrictMode>);
    await waitFor(() => expect(sdk.clients).toHaveLength(1));
    expect(fetcher).toHaveBeenCalledTimes(1);
    const first = sdk.clients[0];
    const remote = { getTracks: () => [] };
    act(() => { first.listeners.audio(remote); first.listeners.play(); });
    expect(screen.container.querySelector("audio")?.srcObject).toBe(remote);
    expect(play).toHaveBeenCalled();
    act(() => first.listeners.close());
    await waitFor(() => expect(first.stopStreaming).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("alert"));
    await waitFor(() => expect(sdk.clients).toHaveLength(2));
    expect(first.stopStreaming).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    screen.unmount();
    await waitFor(() => expect(sdk.clients[1].stopStreaming).toHaveBeenCalledTimes(1));
  });
  it("treats the call as connected once the conversation starts, even without a first-frame event", async () => {
    sdk.session.mockResolvedValue({ data: { session: { access_token: "test-session" } } });
    sdk.create.mockImplementation(() => {
      const listeners: Record<string, (value?: any) => void> = {};
      const client = { addListener: (name: string, fn: (value?: any) => void) => { listeners[name] = fn; }, streamToVideoElement: vi.fn().mockResolvedValue(undefined), stopStreaming: vi.fn().mockResolvedValue(undefined), listeners };
      sdk.clients.push(client); return client;
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ sessionToken: "test-token" }))));
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new Error("no camera")) } });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    calls.start({ kind: "video", agent: { id: "bot", name: "Bot" } as AgentInfo, agentIds: ["bot"] });
    const screen = render(<ActiveCallScreen />);
    await waitFor(() => expect(sdk.clients).toHaveLength(1));
    const c = sdk.clients[0];
    act(() => { c.listeners.audio({ getTracks: () => [] }); c.listeners.history([{ role: "persona", content: "Hi" }]); });
    await waitFor(() => expect(screen.container.querySelector(".ig-call-remote")?.hasAttribute("data-live")).toBe(true));
    expect(c.stopStreaming).not.toHaveBeenCalled();
  });
});
