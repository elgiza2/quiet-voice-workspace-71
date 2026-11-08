export type UsageStatus = { plan: string; isPaid: boolean; allowanceUsd: number; spentUsd: number; remainingUsd: number; stepUsd: number };
export function usagePercent(status: UsageStatus): number {
  if (!Number.isFinite(status.allowanceUsd) || status.allowanceUsd <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(status.spentUsd / status.allowanceUsd * 100)));
}
export const EXHAUSTED_MESSAGE = "Usage limit reached. Subscribe to continue.";
export function isUsageExhausted(message: string | null | undefined) { return Boolean(message?.includes(EXHAUSTED_MESSAGE)); }