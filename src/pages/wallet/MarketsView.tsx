import { useEffect, useMemo, useRef, useState } from "react";
import TradePanel from "./TradePanel";
import { tradeTarget } from "./walletTokens";
import { fetchChart, fetchCoinInfo, fetchMarketList, fetchTrending, type CoinInfo, type Coin, type Hot } from "./marketData";
import { ArrowDownToLine, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Globe, Send, TrendingUp } from "lucide-react";

type News = { title: string; link: string; date: string; image: string; source: string };

const CATS = [
  { key: "trending", label: "Trending" },
  { key: "majors", label: "Majors" },
  { key: "meme-token", label: "Memes" },
  { key: "tokenized-stock", label: "Stocks" },
  { key: "layer-1", label: "Layer 1" },
];
const RANGES = [{ k: "1", l: "1D" }, { k: "7", l: "1W" }, { k: "30", l: "1M" }, { k: "365", l: "1Y" }, { k: "max", l: "All" }];

export const usdFmt = (n: number) => !n ? "$0.00" : n >= 1 ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }) : `$${n.toPrecision(3)}`;
const big = (n: number) => !n ? "—" : n >= 1e12 ? `$${(n / 1e12).toFixed(2)}T` : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString()}`;
const ago = (d: string) => { const m = Math.max(1, Math.round((Date.now() - Date.parse(d)) / 60000)); return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };
const Pct = ({ v }: { v: number | null | undefined }) => v == null ? null : <em className="wl-delta" data-up={v >= 0}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</em>;

/**
 * Loads data and keeps refreshing it while the page is visible. Earlier data stays on
 * screen during refreshes, so prices and news update in place without flicker.
 */
function useLive<T>(key: string | null, load: ((signal: AbortSignal) => Promise<T>) | null, everyMs: number) {
  const [state, setState] = useState<{ key: string | null; data: T | null; err: boolean }>({ key: null, data: null, err: false });
  const loader = useRef(load); loader.current = load;
  useEffect(() => {
    if (!key) return;
    let ctrl = new AbortController(); let stopped = false;
    setState((s) => (s.key === key ? s : { key, data: null, err: false }));
    const run = () => {
      const fn = loader.current; if (!fn || stopped) return;
      ctrl.abort(); ctrl = new AbortController(); const c = ctrl;
      fn(c.signal).then((data) => { if (!c.signal.aborted && !stopped) setState({ key, data, err: false }); })
        .catch(() => { if (!c.signal.aborted && !stopped) setState((s) => ({ key, data: s.key === key ? s.data : null, err: true })); });
    };
    run();
    const t = setInterval(() => { if (document.visibilityState === "visible") run(); }, everyMs);
    const onShow = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { stopped = true; ctrl.abort(); clearInterval(t); document.removeEventListener("visibilitychange", onShow); };
  }, [key, everyMs]);
  const fresh = state.key === key;
  return { data: fresh ? state.data : null, err: fresh && state.err && !state.data };
}
const getJson = async <T,>(url: string, signal: AbortSignal) => { const r = await fetch(url, { signal }); if (!r.ok) throw new Error(String(r.status)); return (await r.json()) as T; };

export function Spark({ data, up, h = 44 }: { data: number[]; up: boolean; h?: number }) {
  if (data.length < 2) return <div className="wl-spark-empty" style={{ height: h }} />;
  const min = Math.min(...data), max = Math.max(...data), r = max - min || 1;
  const pts = data.map((p, i) => `${(i / (data.length - 1)) * 100},${h - ((p - min) / r) * (h - 4) - 2}`).join(" ");
  return <svg className="wl-spark" viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ height: h }}><polyline points={pts} fill="none" data-up={up} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></svg>;
}

/** Large interactive chart: drag/hover to read the price at any point. */
function PriceChart({ data, up, onScrub }: { data: number[][]; up: boolean; onScrub: (p: number[] | null) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const [idx, setIdx] = useState<number | null>(null);
  const H = 220, W = 100;
  if (data.length < 2) return <div className="wl-chart-load" style={{ height: H }}><span /></div>;
  const ys = data.map((d) => d[1]); const min = Math.min(...ys), max = Math.max(...ys), r = max - min || 1;
  const x = (i: number) => (i / (data.length - 1)) * W, y = (v: number) => H - 12 - ((v - min) / r) * (H - 30);
  const line = data.map((d, i) => `${x(i)},${y(d[1])}`).join(" ");
  const move = (clientX: number) => {
    const b = ref.current?.getBoundingClientRect(); if (!b) return;
    const i = Math.round(Math.min(1, Math.max(0, (clientX - b.left) / b.width)) * (data.length - 1));
    setIdx(i); onScrub(data[i]);
  };
  const end = () => { setIdx(null); onScrub(null); };
  return (
    <svg ref={ref} className="wl-bigchart" data-up={up} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H }}
      onPointerMove={(e) => move(e.clientX)} onPointerDown={(e) => move(e.clientX)} onPointerLeave={end} onPointerUp={end}>
      <defs><linearGradient id="wlfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" className="wl-stop-a" /><stop offset="100%" className="wl-stop-b" /></linearGradient></defs>
      <line x1="0" x2={W} y1={y(ys[0])} y2={y(ys[0])} className="wl-base" vectorEffect="non-scaling-stroke" />
      <polygon points={`0,${H} ${line} ${W},${H}`} fill="url(#wlfill)" />
      <polyline points={line} fill="none" className="wl-line" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {idx !== null && <line x1={x(idx)} x2={x(idx)} y1="0" y2={H} className="wl-cursor" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

export function CoinDetail({ id, balance = 0, onBack, onReceive, onSend }: { id: string; balance?: number; onBack: () => void; onReceive: () => void; onSend?: () => void }) {
  const [range, setRange] = useState("1");
  const [copied, setCopied] = useState(false);
  const [scrub, setScrub] = useState<number[] | null>(null);
  const [full, setFull] = useState(false);
  const [trade, setTrade] = useState<"buy" | "sell" | null>(null);
  const { data: info } = useLive<CoinInfo>(`coin:${id}`, (sig) => fetchCoinInfo(id, sig), 30_000);
  const { data: chartRaw, err: chartErr } = useLive<number[][]>(`chart:${id}:${range}`, (sig) => fetchChart(id, range, sig), range === "1" ? 60_000 : 300_000);
  const chart = chartRaw ?? [];
  const md = info?.market_data;
  const live = md?.current_price?.usd ?? chart[chart.length - 1]?.[1] ?? 0;
  const first = chart[0]?.[1] ?? 0;
  const shown = scrub?.[1] ?? live;
  const diff = first ? shown - first : 0;
  const pct = first ? (diff / first) * 100 : md?.price_change_percentage_24h ?? 0;
  const up = pct >= 0;
  const platforms = Object.entries(info?.platforms || {}).filter(([k, v]) => k && v) as [string, string][];
  const links = info?.links;
  const about = (info?.description?.en || "").replace(/<[^>]+>/g, "").trim();
  const sym = (info?.symbol || "").toUpperCase();
  const target = tradeTarget(info?.platforms, id);
  const solMint = target?.token;

  return (
    <div className="wl-detail">
      <header className="wl-dtop">
        <button type="button" className="wl-round" aria-label="Back" onClick={onBack}><ChevronLeft size={22} /></button>
        {info?.image?.large ? <img className="wl-dlogo" src={info.image.large} alt="" /> : <span className="wl-dlogo" />}
      </header>
      <h1 className="wl-dname">{info?.name ?? "\u00a0"} <small>{sym}</small></h1>
      <div className="wl-dprice">{shown ? usdFmt(shown) : "—"}</div>
      <div className="wl-dchange" data-up={up}>{diff >= 0 ? "+" : "-"}{usdFmt(Math.abs(diff))} ({up ? "+" : ""}{pct.toFixed(2)}%)
        <span>{scrub ? new Date(scrub[0]).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : RANGES.find((r) => r.k === range)?.l}</span></div>

      <div className="wl-chartwrap">
        {chartErr ? <p className="wl-note">Chart is busy, try again shortly.</p> : <PriceChart data={chart} up={up} onScrub={setScrub} />}
      </div>
      <div className="wl-seg" role="tablist">
        {RANGES.map((r) => <button key={r.k} type="button" role="tab" aria-selected={range === r.k} onClick={() => setRange(r.k)}>{r.l}</button>)}
      </div>

      <section className="wl-card wl-position">
        <span>Your balance</span>
        <strong>{usdFmt(balance * live)}</strong>
        <small>{balance.toLocaleString("en-US", { maximumFractionDigits: 6 })} {sym}</small>
      </section>

      {about && <section className="wl-sec">
        <h2 className="wl-h2">About {info?.name}</h2>
        <p className={`wl-about ${full ? "" : "wl-clamp"}`}>{about}</p>
        {about.length > 200 && <button type="button" className="wl-textbtn" onClick={() => setFull(!full)}>{full ? "Show less" : "Read more"}</button>}
      </section>}

      {(links?.homepage?.[0] || links?.twitter_screen_name || links?.telegram_channel_identifier) && (
        <div className="wl-linkrow">
          {links?.homepage?.[0] && <a href={links.homepage[0]} target="_blank" rel="noreferrer"><Globe size={16} />Website</a>}
          {links?.twitter_screen_name && <a href={`https://x.com/${links.twitter_screen_name}`} target="_blank" rel="noreferrer"><b>𝕏</b>Twitter</a>}
          {links?.telegram_channel_identifier && <a href={`https://t.me/${links.telegram_channel_identifier}`} target="_blank" rel="noreferrer"><Send size={16} />Telegram</a>}
        </div>
      )}

      <section className="wl-sec">
        <h2 className="wl-h2">Info</h2>
        <dl className="wl-stats">
          <dt>Market cap</dt><dd>{md ? big(md.market_cap.usd) : "—"}</dd>
          <dt>24h volume</dt><dd>{md ? big(md.total_volume.usd) : "—"}</dd>
          <dt>Rank</dt><dd>{info?.market_cap_rank ? `#${info.market_cap_rank}` : "—"}</dd>
          <dt>24h high</dt><dd>{md?.high_24h?.usd ? usdFmt(md.high_24h.usd) : "—"}</dd>
          <dt>24h low</dt><dd>{md?.low_24h?.usd ? usdFmt(md.low_24h.usd) : "—"}</dd>
          <dt>All-time high</dt><dd>{md?.ath?.usd ? usdFmt(md.ath.usd) : "—"}</dd>
          <dt>Circulating supply</dt><dd>{md?.circulating_supply ? `${Math.round(md.circulating_supply).toLocaleString()} ${sym}` : "—"}</dd>
          {platforms[0] && <><dt>Network</dt><dd className="wl-cap">{platforms[0][0].replace(/-/g, " ")}</dd>
            <dt>Contract</dt><dd><button type="button" className="wl-textbtn" onClick={() => { void navigator.clipboard.writeText(platforms[0][1]); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{platforms[0][1].slice(0, 6)}…{platforms[0][1].slice(-4)} {copied ? <Check size={14} /> : <Copy size={14} />}</button></dd></>}
        </dl>
      </section>

      {(info?.categories?.length ?? 0) > 0 && <section className="wl-sec">
        <h2 className="wl-h2">Related lists</h2>
        <div className="wl-tags">{(info?.categories ?? []).filter(Boolean).slice(0, 8).map((c: string) => <span key={c}>{c}</span>)}</div>
      </section>}

      {solMint ? (
        <div className="wl-dock">
          <button type="button" className="wl-btn" onClick={() => setTrade("sell")}>Sell</button>
          <button type="button" className="wl-btn wl-btn-main" onClick={() => setTrade("buy")}>Buy</button>
        </div>
      ) : (
        <div className="wl-dock">
          <button type="button" className="wl-btn wl-btn-main" disabled={!onSend || balance <= 0} onClick={onSend}><Send size={18} />Send</button>
          <button type="button" className="wl-btn" onClick={onReceive}><ArrowDownToLine size={18} />Receive</button>
        </div>
      )}
      {trade && target && <TradePanel target={target} symbol={sym} side={trade} onClose={() => setTrade(null)} />}
    </div>
  );
}

function SectionHead({ title, onMore }: { title: string; onMore?: () => void }) {
  return <button type="button" className="wl-sechead" onClick={onMore} disabled={!onMore}>{title}{onMore && <ChevronRight size={20} />}</button>;
}

export default function MarketsView({ onOpen }: { onOpen: (id: string) => void }) {
  const [cat, setCat] = useState("trending");
  const [more, setMore] = useState(false);
  const { data: trending, err: tErr } = useLive<Hot[]>("trending", (sig) => fetchTrending(sig), 60_000);
  const { data: stocksRaw } = useLive<Coin[]>("stocks", (sig) => fetchMarketList("tokenized-stock", 40, true, sig), 120_000);
  const { data: tradeable } = useLive<{ ids: string[] | null }>("tradeable", (sig) => getJson("/api/tradeable-assets", sig), 600_000);
  const canTrade = useMemo(() => tradeable?.ids ? new Set(tradeable.ids) : null, [tradeable]);
  // Stocks are only listed when they exist as a token the wallet can actually buy and sell.
  const stocks = Array.isArray(stocksRaw) && canTrade ? stocksRaw.filter((s) => canTrade.has(s.id)).slice(0, 10) : [];
  const { data: list, err: lErr } = useLive<Coin[]>(cat === "trending" ? null : `list:${cat}`, (sig) => fetchMarketList(cat === "majors" ? null : cat, 30, true, sig), 30_000);
  const { data: newsData } = useLive<{ items: News[] }>("news", (sig) => getJson("/api/market-news", sig), 60_000);
  const hot = trending ?? [];
  const news = newsData?.items ?? [];

  const rows = useMemo(() => cat === "trending"
    ? hot.map((h) => ({ id: h.item.id, symbol: h.item.symbol, name: h.item.name, image: h.item.small, price: h.item.data?.price ?? 0, mc: h.item.data?.market_cap ?? "—", ch: h.item.data?.price_change_percentage_24h?.usd ?? null }))
    : (Array.isArray(list) ? list : []).filter((c) => cat !== "tokenized-stock" || !canTrade || canTrade.has(c.id)).map((c) => ({ id: c.id, symbol: c.symbol, name: c.name, image: c.image, price: c.current_price, mc: big(c.market_cap), ch: c.price_change_percentage_24h })), [cat, hot, list, canTrade]);
  const loading = rows.length === 0 && !(cat === "trending" ? tErr : lErr);

  return (
    <div className="wl-markets">
      <h2 className="wl-h2 wl-big">Hot markets</h2>
      <p className="wl-sub">Based on trading activity</p>
      <div className="wl-scroll">
        {(hot.length ? hot.slice(0, 8) : Array.from({ length: 2 }, () => null)).map((h, i) => h ? (
          <button type="button" key={h.item.id} className="wl-hot" onClick={() => onOpen(h.item.id)}>
            <div className="wl-hot-top">
              <img src={h.item.small} alt="" />
              <span><strong>{h.item.symbol}</strong><small>{h.item.data?.market_cap ?? ""} MC</small></span>
              <Pct v={h.item.data?.price_change_percentage_24h?.usd} />
            </div>
            <div className="wl-hot-foot"><TrendingUp size={14} />#{i + 1} trending · {h.item.data?.price ? usdFmt(h.item.data.price) : ""}</div>
          </button>
        ) : <div key={i} className="wl-hot wl-skel" />)}
      </div>

      <SectionHead title="Explore markets" />
      <div className="wl-cats">
        {CATS.map((c) => <button key={c.key} type="button" aria-pressed={cat === c.key} onClick={() => { setCat(c.key); setMore(false); }}>{c.label}</button>)}
      </div>
      {!loading && rows.length === 0 && <p className="wl-note">Market data is busy right now. Try again in a minute.</p>}
      <div className="wl-rows">
        {loading && Array.from({ length: 5 }, (_, i) => <div key={i} className="wl-mrow wl-skel" />)}
        {rows.slice(0, more ? 30 : 6).map((r, i) => (
          <button type="button" key={r.id} className="wl-mrow" onClick={() => onOpen(r.id)}>
            <span className="wl-rankwrap"><img src={r.image} alt="" loading="lazy" /><i>{i + 1}</i></span>
            <span className="wl-mrow-mid"><strong>{r.symbol}</strong><small>MC {r.mc}</small></span>
            <span className="wl-mrow-end"><strong>{r.price ? usdFmt(r.price) : "—"}</strong><Pct v={r.ch} /></span>
          </button>
        ))}
      </div>
      {rows.length > 6 && <button type="button" className="wl-morebtn" onClick={() => setMore(!more)}>{more ? "Show less" : "Show more"}</button>}

      {stocks.length > 0 && <>
        <SectionHead title="Stocks" onMore={() => { setCat("tokenized-stock"); setMore(true); window.scrollTo({ top: 300, behavior: "smooth" }); }} />
        <div className="wl-scroll">
          {stocks.map((s) => { const up = (s.price_change_percentage_24h ?? 0) >= 0; return (
            <button type="button" key={s.id} className="wl-stock" onClick={() => onOpen(s.id)}>
              <span className="wl-stock-h"><img src={s.image} alt="" />{s.symbol}</span>
              <Spark data={(s.sparkline_in_7d?.price ?? []).slice(-48)} up={up} h={56} />
              <strong>{usdFmt(s.current_price)}</strong><Pct v={s.price_change_percentage_24h} />
            </button>); })}
        </div>
      </>}

      {news.length > 0 && <>
        <SectionHead title="News" />
        <div className="wl-news">
          {news.slice(0, 10).map((n) => (
            <a key={n.link} href={n.link} target="_blank" rel="noreferrer" className="wl-news-item">
              <span><strong>{n.title}</strong><small>{n.source} · {ago(n.date)} ago <ExternalLink size={12} /></small></span>
              {n.image && <img src={n.image} alt="" loading="lazy" />}
            </a>
          ))}
        </div>
      </>}
      <p className="wl-disclaimer">Market data from CoinGecko, CoinPaprika, CoinLore and Binance, plus public news feeds. Past performance is not a guide to future results. Trading carries high risk.</p>
    </div>
  );
}
