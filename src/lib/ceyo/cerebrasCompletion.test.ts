import { afterEach, expect, it, vi } from "vitest";

const getCerebrasKeys = vi.hoisted(() => vi.fn());
const cerebrasRequest = vi.hoisted(() => vi.fn());
vi.mock("@/lib/keys/cerebrasKey", () => ({
  CEREBRAS_MODELS: { text: "gpt-oss-120b" },
  getCerebrasKeys,
}));
vi.mock("./agentLoop.server", () => ({ cerebrasRequest }));
import { generateCerebrasChatCompletion } from "./cerebrasCompletion.server";

afterEach(() => vi.clearAllMocks());

it("sends non-streaming text summaries to Cerebras using the shared key pool", async () => {
  const keys = [
    { id: "pool-key", table: "provider_api_keys", api_key: "never-log-this", failure_count: 0 },
  ];
  const signal = new AbortController().signal;
  getCerebrasKeys.mockResolvedValue(keys);
  cerebrasRequest.mockResolvedValue(
    Response.json({ choices: [{ finish_reason: "stop", message: { content: "Summary." } }] }),
  );

  const result = await generateCerebrasChatCompletion(
    [
      { role: "system", content: "Summarize." },
      { role: "user", content: "Call turns" },
    ],
    signal,
  );

  expect(result.choices[0].message.content).toBe("Summary.");
  expect(cerebrasRequest).toHaveBeenCalledTimes(1);
  expect(cerebrasRequest.mock.calls[0][0]).toBe(keys);
  expect(JSON.parse(cerebrasRequest.mock.calls[0][1])).toMatchObject({
    model: "gpt-oss-120b",
    stream: false,
    reasoning_effort: "low",
    messages: [
      { role: "system", content: "Summarize." },
      { role: "user", content: "Call turns" },
    ],
  });
  expect(cerebrasRequest.mock.calls[0][2]).toBe(signal);
});
