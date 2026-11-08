import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/legacyClient";
import { convertDisplayPrice, currencyForCountry } from "@/lib/payments/localPrices";
import type { BillingInterval, Tier } from "@/lib/payments/plans";

type Quote = { country: string; amount: number; currency: string };
async function quote(tier: Tier, interval: BillingInterval, signal: AbortSignal): Promise<Quote> {
  const { data } = await supabase.auth.getSession();
  const response = await fetch("/api/billing", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` },
    body: JSON.stringify({ action: "quote", tier, interval, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "" }),
  });
  const result = await response.json();
  if (!response.ok || !Number.isFinite(result.amount) || !/^[A-Z]{3}$/.test(result.currency) || !/^[A-Z]{2}$/.test(result.country)) throw new Error("Local price is unavailable");
  return result;
}

export function useLocalPlanPrices(tier: Tier, hasYearly: boolean) {
  const monthly = useQuery({ queryKey: ["plan-price", tier, "monthly"], queryFn: ({ signal }) => quote(tier, "monthly", signal), staleTime: 60_000, retry: 1 });
  const yearly = useQuery({ queryKey: ["plan-price", tier, "yearly"], queryFn: ({ signal }) => quote(tier, "yearly", signal), enabled: hasYearly, staleTime: 60_000, retry: 1 });
  const currency = monthly.data ? currencyForCountry(monthly.data.country) : null;
  const needsConversion = !!currency && currency !== monthly.data?.currency;
  const rates = useQuery({
    queryKey: ["display-exchange-rates", "USD"], enabled: needsConversion, staleTime: 15 * 60_000, retry: 1,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/public/fx", { signal });
      const result = await response.json();
      if (!response.ok || result.base !== "USD" || !result.rates) throw new Error("Local price is unavailable");
      return result.rates as Record<string, number>;
    },
  });
  const local = (value: Quote | undefined) => {
    if (!value || !currency) return null;
    if (value.currency === currency) return value.amount;
    if (!rates.data || value.currency !== "USD") return null;
    try { return convertDisplayPrice(value.amount, currency, rates.data); } catch { return null; }
  };
  const month = local(monthly.data), year = hasYearly ? local(yearly.data) : null;
  const error = monthly.isError || (hasYearly && yearly.isError) || (needsConversion && (rates.isError || (rates.isSuccess && month === null)));
  return { monthly: month, yearly: year, currency, approximate: needsConversion, error,
    ready: month !== null && (!hasYearly || year !== null),
    retry: () => { void monthly.refetch(); if (hasYearly) void yearly.refetch(); if (needsConversion) void rates.refetch(); },
  };
}