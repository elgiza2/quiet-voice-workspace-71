import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { integrations as CATALOG, type Integration } from "@/lib/integrationsData";
import { disconnectIntegration, loadIntegrationConnections, startIntegrationConnection, waitForConnectionRefresh, integrationSlug, type IntegrationAccount } from "@/lib/integrationBackend";
import { IntegrationLogo } from "@/components/chat/integrations/IntegrationRow";
import { getAuthState, subscribeAuthState } from "@/lib/authStore";
import { readPageState, writePageState } from "@/lib/pageStateCache";
import "@/styles/agent-hub.css";
import "@/styles/ceyo.css";
import "@/styles/settings-polish.css";
type Nav = (to: string) => void;
let appsCache: { ownerId: string | null; updatedAt: number; connected: Record<string, boolean>; accounts: IntegrationAccount[] } | null = null;
function Apps({ nav, appId }: { nav: Nav; appId?: string }) {
  const ownerId = getAuthState().userId;
  if (appsCache?.ownerId !== ownerId) appsCache = null;
  const [connected, setConnectedState] = useState<Record<string, boolean>>(appsCache?.connected || {});
  const [accounts, setAccountsState] = useState<IntegrationAccount[]>(appsCache?.accounts || []);
  const setConnected = (v: Record<string, boolean>) => { appsCache = { ownerId, updatedAt: Date.now(), connected: v, accounts: appsCache?.accounts || [] }; setConnectedState(v); };
  const setAccounts = (v: IntegrationAccount[]) => { appsCache = { ownerId, updatedAt: Date.now(), connected: appsCache?.connected || {}, accounts: v }; setAccountsState(v); };
  const [error, setError] = useState("");
  const [cat, setCat] = useState("All");
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(24);
  const moreRef = useRef<HTMLDivElement>(null);
  const refresh = async (): Promise<boolean> => {
    try { const state = await loadIntegrationConnections(CATALOG); setConnected(state.connectedApps); setAccounts(state.accounts); setError(""); return true; } catch (e) { setError(e instanceof Error ? e.message : "Could not load accounts"); return false; }
  };
  useEffect(() => {
    if (!appsCache || Date.now() - appsCache.updatedAt > 30_000) void refresh();
    const unsubscribe = subscribeAuthState((state) => { if (state.userId !== ownerId) appsCache = null; });
    return () => { unsubscribe(); };
  }, [ownerId]);
  const cats = useMemo(() => ["All", ...Array.from(new Set(CATALOG.map((item) => item.category)))], []);
  useEffect(() => { const saved = readPageState(ownerId, "/settings/apps"); if (saved?.category && cats.includes(saved.category)) setCat(saved.category); }, [ownerId, cats]);
  const chooseCategory = (category: string) => { setCat(category); writePageState(ownerId, "/settings/apps", { ...readPageState(ownerId, "/settings/apps"), category }); };
  const filtered = CATALOG.filter((item) => (cat === "All" || cat === "Suggested" || item.category === cat) && (!query || `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase())));
  const visible = filtered.slice(0, visibleCount);
  useEffect(() => { setVisibleCount(24); }, [cat, query]);
  useEffect(() => {
    const marker = moreRef.current;
    if (!marker || visibleCount >= filtered.length) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) setVisibleCount((count) => count + 24);
    }, { root: marker.closest(".gx-apps-scroll"), rootMargin: "240px" });
    observer.observe(marker);
    return () => observer.disconnect();
  }, [visibleCount, filtered.length, appId]);
  const count = Object.values(connected).filter(Boolean).length;
  const toggle = async (item: Integration) => {
    setBusy(item.app);
    try {
      {
        const before = accounts.filter((a) => a.app === integrationSlug(item.app) && a.status === "ACTIVE").length;
        const result = await startIntegrationConnection(item);
        if ("popup" in result && result.popup) await waitForConnectionRefresh(async () => {
          const state = await loadIntegrationConnections(CATALOG);
          setConnected(state.connectedApps); setAccounts(state.accounts);
          return state.accounts.filter((a) => a.app === integrationSlug(item.app) && a.status === "ACTIVE").length > before;
        }, result.popup);
        toast.success(`${item.name} connected`);
      }
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not connect"); } finally { setBusy(""); }
  };
  const label = (item: Integration) => connected[item.app] ? "Add account" : "Connect";
  const button = (item: Integration, big = false) => <Button variant="ghost" type="button" className={big ? "gx-connect-big" : "gx-pill"} disabled={busy === item.app} onClick={(event) => { event.stopPropagation(); void toggle(item); }}>{busy === item.app ? "…" : label(item)}</Button>;
  const detail = appId ? CATALOG.find((item) => item.app === appId) : undefined;
  if (detail) return <div className="gx-apps gx-sheet" key={detail.id}>
    <button type="button" className="gx-round" aria-label="Close" onClick={() => nav("/settings/apps")}><X size={22} /></button>
    <div className="gx-detail"><span className="gx-logo gx-logo-lg"><IntegrationLogo item={detail} size={44} /></span><h2>{detail.name}</h2><p>{detail.description}</p></div>
    <div className="gx-detail-cta">{button(detail, true)}</div>
    {error && <p className="text-destructive p-4" role="alert">{error}</p>}
    <div className="px-4">{accounts.filter((a) => a.app === integrationSlug(detail.app)).map((account) => <div key={account.id} className="flex items-center gap-3 border-b border-border py-3">
      <span className="min-w-0 flex-1"><strong className="block text-sm break-words">{account.label}</strong><small className="text-muted-foreground">{account.status === "ACTIVE" ? "Connected" : account.status}</small></span>
      <Button variant="ghost" size="icon-sm" aria-label={`Disconnect ${account.label}`} disabled={!!busy} onClick={() => { setBusy(detail.app); void disconnectIntegration(detail, account.id).then(refresh).catch((e) => toast.error(e.message)).finally(() => setBusy("")); }}><Trash2 size={16} /></Button>
    </div>)}</div>
  </div>;
  const row = (item: Integration) => <div key={item.id} className="gx-app-row ceyo-progressive-row" role="button" tabIndex={0} onClick={() => nav(`/settings/apps/${encodeURIComponent(item.app)}`)} onKeyDown={(event) => { if (event.key === "Enter") nav(`/settings/apps/${encodeURIComponent(item.app)}`); }}>
    <span className="gx-logo"><IntegrationLogo item={item} size={30} /></span>
    <span className="gx-app-copy"><strong>{item.name}</strong><small>{item.description}</small></span>
    {button(item)}
  </div>;
  return <div className="gx-apps">
    <header className="gx-apps-head"><Button variant="ghost" size="icon" className="gx-round" aria-label="Back" onClick={() => nav("/settings")}><ChevronLeft size={24} /></Button><h1>Connect apps</h1><span className="gx-count">{count} connected</span></header>
    <div className="gx-chips">{cats.map((category) => <Button variant="ghost" key={category} data-active={cat === category || (category === "All" && cat === "Suggested")} onClick={() => chooseCategory(category)}>{category}</Button>)}</div>
    <div className="gx-apps-scroll">
      {error && <p className="text-destructive p-4" role="alert">{error}</p>}
      {cat === "All" || cat === "Suggested" ? <>
        {!query && <><h3 className="gx-sec">For You <ChevronRight size={18} /></h3>{visible.slice(0, 4).map(row)}<h3 className="gx-sec">Featured plugins <ChevronRight size={18} /></h3></>}
        {(query ? visible : visible.slice(4)).map(row)}
      </> : visible.map(row)}
      {visibleCount < filtered.length && <div ref={moreRef}><Button variant="ghost" onClick={() => setVisibleCount((count) => count + 24)}>More apps</Button></div>}
    </div>
    <div className="gx-bottom-search"><Search size={20} /><input aria-label="Search apps" placeholder="Search across apps and skills" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
  </div>;
}

export default function CeyoAppsSettings() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const sub = pathname.split("/")[3];
  return <Apps nav={(to) => navigate(to)} appId={sub ? decodeURIComponent(sub) : undefined} />;
}
