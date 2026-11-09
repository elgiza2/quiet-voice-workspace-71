import { CEREBRAS_MODELS, getCerebrasKeys } from "@/lib/keys/cerebrasKey";
import { cerebrasRequest } from "./agentLoop.server";

export type CerebrasCompletion = {
  choices: Array<{
    finish_reason?: string | null;
    message: {
      content?: string | null;
      refusal?: string | null;
    };
  }>;
};

/** Route every text completion through the shared Cerebras key pool. */
export async function requestCerebrasChatCompletion(
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Response> {
  const keys = await getCerebrasKeys();
  return cerebrasRequest(keys, JSON.stringify({ ...body, model: CEREBRAS_MODELS.text }), signal);
}

export async function generateCerebrasChatCompletion(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  signal: AbortSignal,
): Promise<CerebrasCompletion> {
  const response = await requestCerebrasChatCompletion(
    { messages, stream: false, reasoning_effort: "low" },
    signal,
  );
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Cerebras completion failed (${response.status})`);
  }
  return (await response.json()) as CerebrasCompletion;
}
