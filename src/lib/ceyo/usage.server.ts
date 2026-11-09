import { EXHAUSTED_MESSAGE } from "./usage";
import type { SupabaseClient } from "@supabase/supabase-js";
export type UsageStatus = { isPaid: boolean; remainingUsd: number; stepUsd: number };
/** Owner-scoped read used by usage gates and entitlement-specific features. */
export async function getUsageStatus(db: SupabaseClient): Promise<UsageStatus> {
  const { data, error } = await db.rpc("agent_usage_status");
  if (error || !data || typeof data.isPaid !== "boolean" || typeof data.remainingUsd !== "number" || typeof data.stepUsd !== "number") throw new Error("Could not check usage. Please try again later.");
  return { isPaid: data.isPaid, remainingUsd: data.remainingUsd, stepUsd: data.stepUsd };
}
/** Owner-scoped read, also used before issuing provider access tokens. */
export async function checkUsageAvailable(db: SupabaseClient): Promise<void> {
  const data = await getUsageStatus(db);
  if (!data.isPaid && data.remainingUsd < data.stepUsd) throw new Error(EXHAUSTED_MESSAGE);
}
export function usageFailure(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Could not check usage. Please try again later.";
  return Response.json({ error: message, code: message === EXHAUSTED_MESSAGE ? "balance_exhausted" : "usage_unavailable" }, { status: message === EXHAUSTED_MESSAGE ? 402 : 503, headers: { "Cache-Control": "no-store" } });
}
/** Called only with an authenticated caller or a verified persisted job owner. */
export async function chargeUsage(userId: string, operationKey: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("charge_agent_usage", { p_user_id: userId, p_operation_key: operationKey });
  if (error) throw new Error("Could not check usage. Please try again later.");
  if (!data || typeof data !== "object" || Array.isArray(data) || !("ok" in data)) throw new Error("Could not check usage. Please try again later.");
  if (data.ok !== true) throw new Error(EXHAUSTED_MESSAGE);
}
