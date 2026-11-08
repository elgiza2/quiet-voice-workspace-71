/** Browser-safe: which payment provider and local methods each country sees on the web. */
import type { BillingInterval, Tier } from "./plans";

export type WebProvider = "kashier" | "dodo";

/** Egypt pays through Kashier (card + Vodafone Cash in EGP); everyone else through Dodo Payments. */
export const providerFor = (country: string): WebProvider => (country.toUpperCase() === "EG" ? "kashier" : "dodo");

const LOCAL: Record<string, string[]> = {
  IN: ["UPI", "RuPay"], BR: ["Pix"], NL: ["iDEAL"], BE: ["Bancontact"], AT: ["EPS"], PT: ["Multibanco"],
  PL: ["BLIK"], KR: ["Kakao Pay", "Naver Pay", "PAYCO"], PH: ["GCash"], HK: ["Alipay HK"], CN: ["WeChat Pay"],
  US: ["Cash App Pay", "Klarna", "Afterpay"], GB: ["Klarna", "Afterpay", "Revolut Pay"],
};
const EURO = ["DE", "FR", "IT", "ES", "IE", "FI", "LU", "GR", "SK", "SI", "EE", "LV", "LT", "MT", "CY"];

/** Methods shown to the user for their country (Dodo also filters live on its own page). */
export function methodsFor(country: string): string[] {
  const c = country.toUpperCase();
  if (c === "EG") return ["Card", "Vodafone Cash"];
  const local = LOCAL[c] ?? (EURO.includes(c) ? ["Klarna", "Satispay"] : []);
  const wallets = c === "IN" ? ["Apple Pay"] : ["Apple Pay", "Google Pay"];
  return ["Card", ...wallets, ...local];
}

/** Dodo product ids created in the live Dodo account for each sold plan. */
export const DODO_PRODUCTS: Partial<Record<`${Tier}_${BillingInterval}`, string>> = {
  plus_monthly: "pdt_0NrRdUFg3DCVXcFIwxtZ8",
  plus_yearly: "pdt_0NrRdUKXUpNmAzmIh6e94",
  pro_monthly: "pdt_0NrRdUOtBHojMrEPiQs3D",
  ultra_monthly: "pdt_0NrRdUSlRFO4r1gHi28Fn",
};

/** Guess the country from the browser's timezone when no edge country header exists. */
export function countryFromTimeZone(tz: string): string | null {
  const map: Record<string, string> = { "Africa/Cairo": "EG", "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "America/Sao_Paulo": "BR", "Europe/Amsterdam": "NL", "Europe/London": "GB", "Asia/Riyadh": "SA", "Asia/Dubai": "AE" };
  return map[tz] ?? null;
}
