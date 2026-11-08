/**
 * Multi-source crypto market data for the wallet. CoinGecko is tried first; CoinPaprika,
 * CoinLore and Binance fill in when it is rate-limited or missing a coin. The last good
 * answer for every request is kept in localStorage so screens never go blank.
 */
import { WALLET_TOKENS, type Market } from "./walletTokens";

const CG = "https://api.coingecko.com/api/v3";
const PP = "https://api.coinpaprika.com/v1";
const CL = "https://api.coinlore.net/api";
const BN = "https://api.binance.com/api/v3";

/** Display names/symbols for coins whose provider name is confusing (e.g. TON is listed as "Gram"). */
const NAME_FIX: Record<string, string> = { "the-open-network": "Toncoin", "toncoin-the-open-network": "Toncoin", "polygon-ecosystem-token": "Polygon", "pol-polygon-ecosystem-token": "Polygon" };
const SYMBOL_FIX: Record<string, string> = { "the-open-network": "TON", "toncoin-the-open-network": "TON" };

/** "Gram (prev. Toncoin)" → "Toncoin", "POL (ex-MATIC)" → "POL". */
export function cleanName(id: string, name: string): string {
  if (NAME_FIX[id]) return NAME_FIX[id];
  const prev = name.match(/^.+?\s*\((?:prev\.?|previously|formerly)\s*([^)]+)\)\s*$/i);
  if (prev) return prev[1].trim();
  return name.replace(/\s*\((?:ex[-\s]|old\s)[^)]*\)\s*$/i, "").trim() || name;
}
export function cleanSymbol(id: string, symbol: string): string {
  return (SYMBOL_FIX[id] ?? symbol ?? "").toUpperCase();
}

/** CoinGecko id → CoinPaprika id for the coins every wallet lists. */
const PP_IDS: Record<string, string> = {
  bitcoin: "btc-bitcoin", ethereum: "eth-ethereum", solana: "sol-solana", binancecoin: "bnb-bnb", tether: "usdt-tether",
  "usd-coin": "usdc-usdc", "the-open-network": "toncoin-the-open-network", "polygon-ecosystem-token": "pol-polygon-ecosystem-token",
  arbitrum: "arb-arbitrum", "avalanche-2": "avax-avalanche", tron: "trx-tron",
};

/** Symbols learnt from any list, so a coin's details can be found on other sources by symbol. */
const symbolHint = new Map<string, string>(WALLET_TOKENS.map((t) => [t.priceId ?? t.id, t.symbol]));
symbolHint.set("the-open-network", "TON");
export const rememberSymbol = (id: string, symbol: string) => { if (id && symbol) symbolHint.set(id, symbol.toUpperCase()); };

async function getJson<T>(url: string, signal?: AbortSignal, tries = 2): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 9000);
    const onAbort = () => timeout.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      const res = await fetch(url, { signal: timeout.signal });
      if (res.ok) return (await res.json()) as T;
      last = new Error(`HTTP ${res.status}`);
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) { last = e; if (signal?.aborted) throw e; }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 1200));
  }
  throw last instanceof Error ? last : new Error("Request failed");
}

const KEY = "ceyo-mkt:";
function remember<T>(key: string, data: T) { try { localStorage.setItem(KEY + key, JSON.stringify(data)); } catch { /* storage full */ } }
export function recall<T>(key: string): T | null { try { const v = localStorage.getItem(KEY + key); return v ? (JSON.parse(v) as T) : null; } catch { return null; } }

/** Try each source in order; keep the first usable answer, else the last good one. */
async function firstOf<T>(key: string, sources: Array<() => Promise<T>>, ok: (v: T) => boolean, signal?: AbortSignal): Promise<T> {
  for (const src of sources) {
    try { const v = await src(); if (ok(v)) { remember(key, v); return v; } } catch (e) { if (signal?.aborted) throw e; }
  }
  const cached = recall<T>(key);
  if (cached) return cached;
  throw new Error("Market data unavailable");
}

const num = (v: unknown) => { const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN; return Number.isFinite(n) ? n : 0; };
const ppLogo = (ppId: string) => `https://static.coinpaprika.com/coin/${ppId}/logo.png`;

type PpTicker = { id: string; name: string; symbol: string; rank: number; circulating_supply?: number; quotes: { USD: { price: number; market_cap: number; volume_24h: number; percent_change_24h: number; ath_price?: number } } };
type ClTicker = { symbol: string; name: string; nameid: string; rank: number; price_usd: string; percent_change_24h: string; market_cap_usd: string; volume24: number; csupply: string };

/** Paprika id for a CoinGecko id, found by our table or by symbol search. */
async function paprikaId(id: string, signal?: AbortSignal): Promise<string | null> {
  if (PP_IDS[id]) return PP_IDS[id];
  const sym = symbolHint.get(id);
  if (!sym) return null;
  const r = await getJson<{ currencies?: { id: string; symbol: string; rank: number }[] }>(`${PP}/search/?q=${encodeURIComponent(sym)}&c=currencies&limit=6`, signal, 1);
  const hit = (r.currencies || []).filter((c) => c.symbol.toUpperCase() === sym && c.rank > 0).sort((a, b) => a.rank - b.rank)[0];
  return hit?.id ?? null;
}

// ---------- wallet prices ----------

/** Prices for every wallet token; each missing coin is filled from the next source. */
export async function fetchWalletPrices(signal?: AbortSignal): Promise<Record<string, Market>> {
  const ids = [...new Set(WALLET_TOKENS.map((t) => t.priceId ?? t.id))];
  const map: Record<string, Market> = {};
  try {
    const list = await getJson<Market[]>(`${CG}/coins/markets?vs_currency=usd&ids=${ids.join(",")}`, signal);
    for (const m of list) if (m?.current_price) map[m.id] = m;
  } catch (e) { if (signal?.aborted) throw e; }
  let missing = ids.filter((id) => !map[id]);
  if (missing.length) {
    await Promise.all(missing.map(async (id) => {
      const pp = PP_IDS[id]; if (!pp) return;
      try {
        const t = await getJson<PpTicker>(`${PP}/tickers/${pp}`, signal, 1);
        if (t?.quotes?.USD?.price) map[id] = { id, image: recall<Record<string, Market>>("prices")?.[id]?.image || ppLogo(pp), current_price: t.quotes.USD.price, price_change_percentage_24h: t.quotes.USD.percent_change_24h ?? null };
      } catch { /* next source */ }
    }));
    missing = ids.filter((id) => !map[id]);
  }
  if (missing.length) {
    const pairs = missing.map((id) => [id, `${symbolHint.get(id) || ""}USDT`] as const).filter(([, s]) => s !== "USDT" && s !== "USDTUSDT");
    if (pairs.length) try {
      const rows = await getJson<{ symbol: string; lastPrice: string; priceChangePercent: string; closeTime: number }[]>(`${BN}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(pairs.map(([, s]) => s)))}`, signal, 1);
      for (const [id, s] of pairs) {
        const r = rows.find((x) => x.symbol === s);
        if (r && num(r.lastPrice) && Date.now() - r.closeTime < 3 * 3600_000) map[id] = { id, image: recall<Record<string, Market>>("prices")?.[id]?.image || "", current_price: num(r.lastPrice), price_change_percentage_24h: num(r.priceChangePercent) };
      }
    } catch { /* keep cache */ }
    if (missing.includes("tether") && !map.tether) map.tether = { id: "tether", image: recall<Record<string, Market>>("prices")?.tether?.image || ppLogo("usdt-tether"), current_price: 1, price_change_percentage_24h: null };
  }
  const cached = recall<Record<string, Market>>("prices") || {};
  for (const id of ids) if (!map[id] && cached[id]) map[id] = cached[id];
  if (!Object.keys(map).length) throw new Error("Prices unavailable");
  remember("prices", map);
  for (const t of WALLET_TOKENS) if (t.priceId && map[t.priceId]) map[t.id] = map[t.priceId];
  return map;
}

// ---------- market lists ----------

export type Coin = { id: string; symbol: string; name: string; image: string; current_price: number; market_cap: number; total_volume?: number; price_change_percentage_24h: number | null; sparkline_in_7d?: { price: number[] } };
export type Hot = { item: { id: string; symbol: string; name: string; small: string; data?: { price?: number; market_cap?: string; price_change_percentage_24h?: { usd?: number } } } };

const big = (n: number) => !n ? "" : n >= 1e12 ? `$${(n / 1e12).toFixed(2)}T` : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString()}`;
const tidy = (c: Coin): Coin => { rememberSymbol(c.id, c.symbol); return { ...c, name: cleanName(c.id, c.name), symbol: cleanSymbol(c.id, c.symbol) }; };

async function coinloreTop(signal?: AbortSignal): Promise<Coin[]> {
  const r = await getJson<{ data: ClTicker[] }>(`${CL}/tickers/?start=0&limit=100`, signal, 1);
  return r.data.map((t) => ({ id: t.nameid, symbol: t.symbol, name: t.name, image: `https://www.coinlore.com/img/25x25/${t.nameid}.png`, current_price: num(t.price_usd), market_cap: num(t.market_cap_usd), total_volume: num(t.volume24), price_change_percentage_24h: num(t.percent_change_24h) }));
}

/** Top coins by market cap, or a CoinGecko category (memes, layer 1, stocks…). */
export async function fetchMarketList(category: string | null, perPage = 30, sparkline = true, signal?: AbortSignal): Promise<Coin[]> {
  const cg = () => getJson<Coin[]>(`${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&sparkline=${sparkline}${category ? `&category=${category}` : ""}`, signal);
  const sources: Array<() => Promise<Coin[]>> = [cg];
  // Other sources have no categories, so they only stand in for the overall top list.
  if (!category) sources.push(async () => (await coinloreTop(signal)).slice(0, perPage));
  const list = await firstOf(`list:${category || "top"}`, sources, (v) => Array.isArray(v) && v.length > 0, signal);
  return list.map(tidy);
}

/** Coins people are trading most right now. */
export async function fetchTrending(signal?: AbortSignal): Promise<Hot[]> {
  const fromCoins = (coins: Coin[]): Hot[] => coins.map((c) => ({ item: { id: c.id, symbol: c.symbol, name: c.name, small: c.image, data: { price: c.current_price, market_cap: big(c.market_cap), price_change_percentage_24h: { usd: c.price_change_percentage_24h ?? undefined } } } }));
  const hot = await firstOf<Hot[]>("trending", [
    async () => (await getJson<{ coins: Hot[] }>(`${CG}/search/trending`, signal)).coins,
    async () => fromCoins((await coinloreTop(signal)).filter((c) => !/^(USDT|USDC|DAI|FDUSD|USDE|TUSD)$/i.test(c.symbol)).sort((a, b) => (b.total_volume || 0) - (a.total_volume || 0)).slice(0, 15)),
  ], (v) => Array.isArray(v) && v.length > 0, signal);
  return hot.map((h) => { rememberSymbol(h.item.id, h.item.symbol); return { item: { ...h.item, name: cleanName(h.item.id, h.item.name), symbol: cleanSymbol(h.item.id, h.item.symbol) } }; });
}

// ---------- coin details ----------

/** A coin's details in CoinGecko's shape, so the detail screen reads one format from any source. */
export type CoinInfo = {
  id: string; name: string; symbol: string; image?: { large?: string }; market_cap_rank?: number | null;
  description?: { en?: string }; categories?: string[]; platforms?: Record<string, string>;
  links?: { homepage?: string[]; twitter_screen_name?: string; telegram_channel_identifier?: string };
  market_data?: { current_price: { usd: number }; market_cap: { usd: number }; total_volume: { usd: number }; high_24h?: { usd?: number }; low_24h?: { usd?: number }; ath?: { usd?: number }; circulating_supply?: number; price_change_percentage_24h?: number };
};

export async function fetchCoinInfo(id: string, signal?: AbortSignal): Promise<CoinInfo> {
  const info = await firstOf<CoinInfo>(`coin:${id}`, [
    () => getJson<CoinInfo>(`${CG}/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false`, signal),
    async () => {
      const pp = await paprikaId(id, signal); if (!pp) throw new Error("not found");
      const [c, t] = await Promise.all([
        getJson<{ name: string; symbol: string; rank: number; logo?: string; description?: string; tags?: { name: string }[]; links?: { website?: string[] }; links_extended?: { url: string; type: string }[] }>(`${PP}/coins/${pp}`, signal, 1),
        getJson<PpTicker>(`${PP}/tickers/${pp}`, signal, 1),
      ]);
      const ext = c.links_extended || [];
      const handle = (type: string, re: RegExp) => ext.find((l) => l.type === type)?.url.match(re)?.[1];
      const q = t.quotes.USD;
      return {
        id, name: c.name, symbol: c.symbol, image: { large: c.logo || ppLogo(pp) }, market_cap_rank: c.rank || null,
        description: { en: c.description || "" }, categories: (c.tags || []).map((x) => x.name).slice(0, 8),
        links: { homepage: c.links?.website || [], twitter_screen_name: handle("twitter", /(?:twitter|x)\.com\/([^/?#]+)/i), telegram_channel_identifier: handle("telegram", /t\.me\/([^/?#]+)/i) },
        market_data: { current_price: { usd: q.price }, market_cap: { usd: q.market_cap }, total_volume: { usd: q.volume_24h }, ath: { usd: q.ath_price }, circulating_supply: t.circulating_supply, price_change_percentage_24h: q.percent_change_24h },
      };
    },
  ], (v) => Boolean(v?.name), signal);
  rememberSymbol(id, info.symbol);
  return { ...info, name: cleanName(id, info.name), symbol: cleanSymbol(id, info.symbol) };
}

const KLINES: Record<string, [string, number]> = { "1": ["15m", 96], "7": ["1h", 168], "30": ["4h", 180], "365": ["1d", 365], max: ["1w", 1000] };

/** Price history as [timestamp, price] points. */
export async function fetchChart(id: string, days: string, signal?: AbortSignal): Promise<number[][]> {
  return firstOf<number[][]>(`chart:${id}:${days}`, [
    async () => (await getJson<{ prices: number[][] }>(`${CG}/coins/${id}/market_chart?vs_currency=usd&days=${days}`, signal)).prices,
    async () => {
      const sym = symbolHint.get(id); if (!sym || /^USD/.test(sym)) throw new Error("no pair");
      const [interval, limit] = KLINES[days] || KLINES["1"];
      const rows = await getJson<(string | number)[][]>(`${BN}/klines?symbol=${sym}USDT&interval=${interval}&limit=${limit}`, signal, 1);
      const last = rows[rows.length - 1];
      // Delisted pairs keep returning old candles; only use a live market.
      if (!last || Date.now() - Number(last[6]) > 3 * 3600_000) throw new Error("stale");
      return rows.map((r) => [Number(r[6]), num(r[4])]);
    },
    async () => {
      if (days !== "1") throw new Error("range unavailable");
      const pp = await paprikaId(id, signal); if (!pp) throw new Error("not found");
      const start = new Date(Date.now() - 23 * 3600_000).toISOString().replace(/\.\d+Z$/, "Z");
      const rows = await getJson<{ timestamp: string; price: number }[]>(`${PP}/tickers/${pp}/historical?start=${start}&interval=1h`, signal, 1);
      return rows.map((r) => [Date.parse(r.timestamp), r.price]);
    },
  ], (v) => Array.isArray(v) && v.length > 1, signal);
}
