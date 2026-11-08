/** Presentation only: settlement amounts remain owned by the billing server. */
const currencies: Record<string, string> = {
  EG: "EGP", SA: "SAR", AE: "AED", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR",
  JO: "JOD", LB: "LBP", IQ: "IQD", MA: "MAD", DZ: "DZD", TN: "TND", LY: "LYD",
  SD: "SDG", YE: "YER", US: "USD", GB: "GBP", CA: "CAD", AU: "AUD", NZ: "NZD",
  IN: "INR", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR", BR: "BRL", MX: "MXN",
  AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN", UY: "UYU", BO: "BOB", CR: "CRC",
  CH: "CHF", NO: "NOK", SE: "SEK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF",
  RO: "RON", BG: "EUR", TR: "TRY", UA: "UAH", RS: "RSD", RU: "RUB", GE: "GEL",
  CN: "CNY", HK: "HKD", TW: "TWD", JP: "JPY", KR: "KRW", SG: "SGD", MY: "MYR",
  ID: "IDR", PH: "PHP", TH: "THB", VN: "VND", IL: "ILS", ZA: "ZAR", NG: "NGN",
  KE: "KES", GH: "GHS", TZ: "TZS", UG: "UGX", ET: "ETB", IS: "ISK",
};
const euro = new Set("AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK MC SM VA AD".split(" "));

export function currencyForCountry(country: string): string {
  const code = country.toUpperCase();
  return euro.has(code) ? "EUR" : currencies[code] || "USD";
}

export function convertDisplayPrice(amount: number, currency: string, rates: Record<string, number>): number {
  const rate = currency === "USD" ? 1 : rates[currency];
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0) throw new Error("Local price is unavailable");
  const decimals = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return Math.round(amount * rate * 10 ** decimals) / 10 ** decimals;
}

export function formatLocalPrice(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "symbol", maximumFractionDigits: currency === "EGP" ? 0 : undefined }).format(amount);
}