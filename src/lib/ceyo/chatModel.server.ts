import { CEREBRAS_MODELS } from "@/lib/keys/cerebrasKey";
import { z } from "zod";
import { requestCerebrasChatCompletion } from "./cerebrasCompletion.server";

export const CHAT_MODEL = CEREBRAS_MODELS.text;
const functionCall = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({ name: z.string(), arguments: z.string() }),
});
const message = z.discriminatedUnion("role", [
  z.object({ role: z.literal("system"), content: z.string() }),
  z.object({ role: z.literal("user"), content: z.string() }),
  z.object({
    role: z.literal("assistant"),
    content: z.string().nullable().optional(),
    tool_calls: z.array(functionCall).optional(),
  }),
  z.object({ role: z.literal("tool"), content: z.string(), tool_call_id: z.string() }),
]);
const tool = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.unknown()).optional(),
  }),
});

/** Adapt the Cerebras OpenAI-compatible SSE to the existing agent-loop transcript. */
export async function chatModelResponse(
  messages: unknown[],
  tools: unknown[],
  signal: AbortSignal,
): Promise<Response> {
  const parsedMessages = z
    .array(message)
    .parse(messages)
    .map((m) => {
      if (m.role === "tool")
        return {
          role: "tool" as const,
          content: m.content ?? "",
          tool_call_id: m.tool_call_id ?? "",
        };
      if (m.role === "assistant")
        return {
          role: "assistant" as const,
          content: m.content ?? null,
          tool_calls: m.tool_calls?.map((c) => ({
            id: c.id ?? "",
            type: "function" as const,
            function: { name: c.function?.name ?? "", arguments: c.function?.arguments ?? "{}" },
          })),
        };
      if (m.role === "user") return { role: "user" as const, content: m.content ?? "" };
      return { role: "system" as const, content: m.content ?? "" };
    });
  const parsedTools = z
    .array(tool)
    .parse(tools)
    .map((t) => ({
      type: "function" as const,
      function: {
        name: t.function?.name ?? "",
        description: t.function?.description,
        parameters: t.function?.parameters,
      },
    }));
  return requestCerebrasChatCompletion(
    {
      messages: parsedMessages,
      tools: parsedTools,
      stream: true,
      reasoning_effort: "low",
    },
    signal,
  );
}
