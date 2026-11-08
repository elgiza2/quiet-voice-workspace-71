import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import type { UsageStatus } from "./usage";
import { z } from "zod";
const statusSchema = z.object({ plan: z.string(), isPaid: z.boolean(), allowanceUsd: z.number().nonnegative(), spentUsd: z.number().nonnegative(), remainingUsd: z.number().nonnegative(), stepUsd: z.number().positive() });
export const getUsageStatus = createServerFn({ method: "POST" }).handler(async (): Promise<UsageStatus> => {
  const { authenticate } = await import("./auth.server");
  const { db } = await authenticate(getRequest());
  setResponseHeader("Cache-Control", "no-store");
  const { data, error } = await db.rpc("agent_usage_status");
  if (error || !data) throw new Error("Could not load usage. Please try again.");
  const parsed = statusSchema.parse(data);
  return { plan: parsed.plan, isPaid: parsed.isPaid, allowanceUsd: parsed.allowanceUsd, spentUsd: parsed.spentUsd, remainingUsd: parsed.remainingUsd, stepUsd: parsed.stepUsd };
});