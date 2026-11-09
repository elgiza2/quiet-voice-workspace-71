import { beforeEach, expect, it, vi } from "vitest";

const request = vi.hoisted(() => vi.fn());
vi.mock("./cerebrasCompletion.server", () => ({ requestCerebrasChatCompletion: request }));
import { CHAT_MODEL, chatModelResponse } from "./chatModel.server";

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue(
    new Response("data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } }),
  );
});

it("sends streamed chat and function tools to the Cerebras model", async () => {
  const tools = [
    {
      type: "function",
      function: {
        name: "calculate",
        parameters: {
          type: "object",
          properties: { expression: { type: "string" } },
          required: ["expression"],
        },
      },
    },
  ];
  const signal = new AbortController().signal;
  await chatModelResponse([{ role: "user", content: "Calculate 7+8" }], tools, signal);
  expect(CHAT_MODEL).toBe("gpt-oss-120b");
  expect(request.mock.calls[0][0]).toMatchObject({ stream: true, reasoning_effort: "low", tools });
  expect(request.mock.calls[0][0].messages).toEqual([{ role: "user", content: "Calculate 7+8" }]);
  expect(request.mock.calls[0][1]).toBe(signal);
});

it("preserves tool calls and their results for the next Cerebras request", async () => {
  const messages = [
    { role: "user", content: "Calculate 7+8" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "calc1",
          type: "function",
          function: { name: "calculate", arguments: '{"expression":"7+8"}' },
        },
      ],
    },
    { role: "tool", content: '{"result":15}', tool_call_id: "calc1" },
  ];
  await chatModelResponse(
    messages,
    [{ type: "function", function: { name: "calculate" } }],
    new AbortController().signal,
  );
  expect(request.mock.calls[0][0].messages).toEqual(messages);
});

it("uses the Cerebras adapter for tool-free chat too", async () => {
  await chatModelResponse(
    [{ role: "user", content: "Summarize the call" }],
    [],
    new AbortController().signal,
  );
  expect(request.mock.calls[0][0]).toMatchObject({
    stream: true,
    reasoning_effort: "low",
    tools: [],
  });
});
