import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getUsageStatus } from "@/lib/ceyo/usage.functions";
import { getAuthState } from "@/lib/authStore";
import { usagePercent } from "@/lib/ceyo/usage";
export function useUsage() {
  const load = useServerFn(getUsageStatus);
  const owner = getAuthState().userId;
  const query = useQuery({ queryKey: ["agent-usage", owner], queryFn: () => load(), enabled: Boolean(owner), staleTime: 0 });
  return { ...query, percent: query.data ? usagePercent(query.data) : null, plan: query.data?.plan || "free", exhausted: query.data?.isPaid === false && query.data.remainingUsd < query.data.stepUsd };
}