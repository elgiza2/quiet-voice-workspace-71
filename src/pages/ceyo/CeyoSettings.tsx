/** Ceyo settings — compact dark sheets matching the supplied mobile references. */
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { askConfirm } from "@/components/common/CeyoConfirm";
import {
  ArrowUpRight, Check, ChevronLeft, ChevronRight, ChevronsUpDown, Contrast, Copy, CreditCard,
  KeyRound, Moon, Phone as PhoneIcon, PhoneIncoming, PhoneOutgoing, Plus, Search, Smartphone, Star, Sun, Trash2, User, Vault, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/legacyClient";
import { useUsage } from "@/hooks/useUsage";
import { clearPageStates, PAGE_STATE_PREFIX } from "@/lib/pageStateCache";
import { getStoredTheme, setTheme, type ThemeMode } from "@/lib/theme";
import { loadWorkspace, useWorkspaceStore } from "@/lib/agentsky/store";
import { Button } from "@/components/ui/button";
import { validateVaultDetail } from "@/lib/ceyo/content";
import {
  DEFAULT_PERMISSIONS, PERMISSIONS_STORAGE_KEY, addPermissionRule, parsePermissionPreferences,
  permissionSummary, removePermissionRule, type PermissionPreferences, type PermissionRuleKind,
} from "./settingsPreferences";
import "@/styles/agent-hub.css";
import "@/styles/ceyo.css";
import "@/styles/settings-polish.css";
const CheckoutSheet = lazy(() => import("@/components/billing/CheckoutSheet").then((m) => ({ default: m.CheckoutSheet })));
import { useUserLang } from "@/lib/authI18n";
import "@/styles/subscriptions.css";
import { getAuthState } from "@/lib/authStore";
import { readPageState, writePageState } from "@/lib/pageStateCache";
import { useLocalPlanPrices } from "@/hooks/useLocalPlanPrices";
import { formatLocalPrice } from "@/lib/payments/localPrices";
import { readSetting, saveSetting } from "./settingsStorage";

type Nav = (to: string) => void;

function Shell({ title, back, children, action, className = "" }: { title: string; back: () => void; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div key={title} className={`agent-hub ceyo-page ${className}`} data-no-translate>
      <header className="ceyo-top">
        <Button variant="ghost" size="icon" type="button" className="gx-round" aria-label={title === "Settings" ? "Close" : "Back"} onClick={back}>
          {title === "Settings" ? <X size={20} /> : <ChevronLeft size={20} />}
        </Button>
        {title !== "Settings" && <h1>{title}</h1>}
        <span className="ceyo-top-action">{action}</span>
      </header>
      <div className="ceyo-scroll">{children}</div>
    </div>
  );
}

function Row({ icon, label, value, onClick, danger, right, sub, checked, disabled }: {
  icon?: ReactNode;
  label: string;
  value?: string;
  onClick?: () => void;
  danger?: boolean;
  right?: ReactNode;
  sub?: string;
  checked?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="ceyo-row"
      data-danger={danger}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={checked}
      tabIndex={onClick ? 0 : -1}
    >
      {icon && <span className="ceyo-row-icon">{icon}</span>}
      <span className="ceyo-row-label"><strong>{label}</strong>{sub && <small>{sub}</small>}</span>
      {value && <span className="ceyo-row-value">{value}</span>}
      {right ?? (onClick && !danger ? <ChevronRight size={17} className="ceyo-row-chev" /> : null)}
    </button>
  );
}

const Group = ({ children, title }: { children: ReactNode; title?: string }) => (
  <section className="ceyo-group">{title && <h2>{title}</h2>}<div>{children}</div></section>
);

const Toggle = ({ on }: { on: boolean }) => <span className="ceyo-switch" data-on={on}><i /></span>;
const Ext = () => <ArrowUpRight size={18} className="ceyo-row-chev" />;

async function signOut(nav: Nav) {
  if (!(await askConfirm({ title: "Sign out of Ceyo?", body: "Your bots and chats stay saved. Sign back in anytime.", confirm: "Sign Out", danger: true }))) return;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    nav("/auth?mode=signup");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not sign out");
  }
}

function useMe() {
  const [me, setMe] = useState({ email: "", name: "", avatar: "" });
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const metadata = (data.user?.user_metadata || {}) as Record<string, string>;
      setMe({
        email: data.user?.email || "",
        name: metadata.full_name || metadata.name || "",
        avatar: metadata.avatar_url || metadata.picture || "",
      });
    });
  }, []);
  return me;
}

function MeCard({ onClick }: { onClick?: () => void }) {
  const me = useMe();
  return (
    <button type="button" className="ceyo-row ceyo-me" onClick={onClick} tabIndex={onClick ? 0 : -1}>
      <span className="ceyo-avatar">{me.avatar ? <img src={me.avatar} alt="" /> : (me.name || me.email || "C").charAt(0).toUpperCase()}</span>
      <span className="ceyo-row-label"><strong>{me.name || "Ceyo account"}</strong><small>{me.email}</small></span>
      {onClick && <ChevronRight size={17} className="ceyo-row-chev" />}
    </button>
  );
}

function Main({ nav }: { nav: Nav }) {
  const [haptics, setHaptics] = useState(true);
  const [notify, setNotify] = useState(false);
  const [theme, setThemeMode] = useState<ThemeMode>("dark");
  const [language, setLanguage] = useState("System");
  const [permissions, setPermissions] = useState<PermissionPreferences>(DEFAULT_PERMISSIONS);
  const usage = useUsage();
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";

  useEffect(() => {
    setHaptics(readSetting("ceyo_haptics") !== "off");
    setNotify(readSetting("ceyo_notify") === "on");
    setThemeMode(getStoredTheme());
    const savedLanguage = readSetting("ceyo_language") || "system";
    setLanguage(LANGUAGES.find(([code]) => code === savedLanguage)?.[1] || "System");
    setPermissions(parsePermissionPreferences(readSetting(PERMISSIONS_STORAGE_KEY)));
    applySurface(readSetting("ceyo_surface") === "bot" ? "bot" : "black");
  }, []);

  const flip = (key: string, value: boolean, set: (value: boolean) => void) => {
    if (!saveSetting(key, value ? "on" : "off")) { toast.error("Could not save this preference on your device."); return; }
    set(value);
    if (key === "ceyo_haptics" && value && "vibrate" in navigator) navigator.vibrate(12);
  };

  const toggleNotifications = async () => {
    if (notify) return flip("ceyo_notify", false, setNotify);
    if (!("Notification" in window)) return toast.error("Notifications are not supported on this device");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return toast.error("Allow notifications in your browser settings first");
    flip("ceyo_notify", true, setNotify);
  };

  return (
    <Shell title="Settings" back={() => nav("/")}>
      <Group>
        <MeCard onClick={() => nav("/settings/account")} />
        <Row label="Usage" value={usage.isPending ? "…" : usage.isError ? "Unavailable" : usage.data?.isPaid ? "Subscribed" : `${usage.percent}%`} onClick={() => nav("/settings/usage")} />
        <Row label="Manage Subscription" onClick={() => nav("/settings/subscription")} />
        <Row label="Storage" sub="Files, memories and cache" onClick={() => nav("/settings/storage")} />
        <Row label="Vault" sub="Saved labels and contact info on this device" onClick={() => nav("/settings/vault")} />
      </Group>
      <Group><Row label="Connect apps" sub="Search plugins" onClick={() => nav("/settings/apps")} /></Group>
      <Group title="Agent">
        <Row label="Permissions" sub={permissionSummary(permissions)} onClick={() => nav("/settings/permissions")} />
        <Row label="Phone calls" sub="Your mobile, agent numbers and call history" onClick={() => nav("/settings/phone")} />
        <Row label="Time Zone" value={tz} right={<span />} />
        <Row label="Agent Computer" onClick={() => nav("/settings/computer")} />
        <Row label="Manage your devices" onClick={() => nav("/settings/devices")} />
        <Row label="Import Memory" onClick={() => nav("/settings/memory")} />
      </Group>
      <Group>
        <Row label="Notifications" checked={notify} onClick={() => void toggleNotifications()} right={<Toggle on={notify} />} />
        <Row label="Appearance" value={theme === "system" ? "Follow System" : theme === "dark" ? "Dark" : "Light"} onClick={() => nav("/settings/appearance")} />
        <Row label="Language" value={language} onClick={() => nav("/settings/language")} />
        <Row label="Haptics" value={haptics ? "On" : "Off"} onClick={() => flip("ceyo_haptics", !haptics, setHaptics)} />
      </Group>
      <Group>
        <Row label="Telegram Community" sub="t.me/Ceyois" onClick={() => window.open("https://t.me/Ceyois", "_blank", "noopener")} right={<Ext />} />
        <Row label="X Community" sub="@ceyosi" onClick={() => window.open("https://x.com/ceyosi", "_blank", "noopener")} right={<Ext />} />
      </Group>
      <Group>
        <Row label="Help Center" sub="Guides for bots, groups and routines" onClick={() => nav("/docs")} right={<Ext />} />
        <Row label="About Ceyo" onClick={() => nav("/about")} right={<Ext />} />
        <Row label="Contact" onClick={() => nav("/contact")} right={<Ext />} />
        <Row label="Privacy Policy" onClick={() => nav("/privacy")} right={<Ext />} />
        <Row label="Terms of Service" onClick={() => nav("/terms")} right={<Ext />} />
        <Row label="Subscription Terms" onClick={() => nav("/subscription-terms")} right={<Ext />} />
        <Row label="Cookies & Local Storage" onClick={() => nav("/cookies")} right={<Ext />} />
        <Row label="Security" onClick={() => nav("/security")} right={<Ext />} />
      </Group>
      <p className="ceyo-legal-note">Ceyo is owned and operated by Megsy LLC.</p>
      <Group><Row label="Send Feedback" onClick={() => nav("/settings/feedback")} /></Group>
      <Group><Row label="Sign Out" danger onClick={() => void signOut(nav)} /></Group>
      <div className="ceyo-brand-foot"><span className="ceyo-brand-orb"><i /><i /></span><strong>Ceyo</strong><small>1.0.0</small></div>
    </Shell>
  );
}

function Account({ nav }: { nav: Nav }) {
  const me = useMe();
  const addAccount = async () => {
    if (!(await askConfirm({ title: "Add another account?", body: "You will be signed out of this account to sign in with another one.", confirm: "Continue" }))) return;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      nav("/auth");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not switch account");
    }
  };
  return (
    <Shell title="Account" back={() => nav("/settings")}>
      <Group><MeCard /></Group>
      <Group title="Switch Account">
        <Row label={me.email || "—"} right={<Check size={18} />} />
        <Row icon={<Plus size={20} />} label="Add Account" onClick={() => void addAccount()} right={<span />} />
      </Group>
      <Group><Row label="Sign Out" danger onClick={() => void signOut(nav)} /></Group>
      <Group><Row icon={<Trash2 size={19} />} label="Delete Account" danger onClick={() => nav("/settings/delete-account")} /></Group>
      <p className="ceyo-note">Permanently deletes your Ceyo account. This can't be undone.</p>
    </Shell>
  );
}

function Usage({ nav }: { nav: Nav }) {
  const usage = useUsage();
  const { plan } = usage;
  const ar = useUserLang().startsWith("ar");
  return (
    <Shell title="Usage" back={() => nav("/settings")}>
      {usage.isError && <Group><Row label="Could not load usage" onClick={() => void usage.refetch()} sub="Try again" /></Group>}
      <div className="ceyo-usage-panel">
        <div className="ceyo-usage-body">
          <div className="ceyo-usage-head"><strong>{usage.data?.isPaid ? "Subscription" : "Free usage"}</strong><span>{usage.data?.isPaid ? "Active" : "One-time allowance"}</span></div>
          {!usage.data?.isPaid && <div className="ceyo-bar" role="progressbar" aria-label="Usage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usage.percent ?? 0}><i style={{ width: `${usage.percent ?? 0}%` }} /></div>}
          <span className="ceyo-usage-percent">{usage.isPending ? "…" : usage.isError ? "Unavailable" : usage.data?.isPaid ? "Subscribed" : `${usage.percent}% used`}</span>
        </div>
      </div>
      <Group title="Plan">
        <Row label="Current plan" value={plan.charAt(0).toUpperCase() + plan.slice(1)} right={<span />} />
      </Group>
      {usage.exhausted && <p className="ceyo-note" role="alert">{ar ? "نفد الاستخدام المجاني. اشترك علشان تكمل." : "Free usage exhausted. Subscribe to continue."}</p>}
      <Group>
        <Row label={ar ? "اشترك" : "Subscribe"} onClick={() => nav("/settings/plans")} />
        <Row label="Manage subscription" onClick={() => nav("/settings/subscription")} />
        <Row label="Usage alerts" sub="Not available yet" disabled right={<Toggle on={false} />} />
      </Group>
    </Shell>
  );
}

function fmtBytes(n: number) { return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`; }

function Storage({ nav }: { nav: Nav }) {
  const [loadError, setLoadError] = useState("");
  const [docs, setDocs] = useState<{ id: string; name: string; size: number }[] | null>(null);
  const [memCount, setMemCount] = useState<number | null>(null);
  const [cache, setCache] = useState(0);
  const measureCache = () => { let t = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i) || ""; if (k.startsWith(PAGE_STATE_PREFIX)) t += k.length + (readSetting(k)?.length || 0); } } catch { /* Device storage is optional. */ } setCache(t * 2); };
  const load = async () => {
    const { data, error } = await supabase.from("agent_documents").select("id,name,content").order("created_at", { ascending: false });
    if (error) { setLoadError("Could not load files. Please try again."); return; }
    setDocs((data || []).map((d: { id: string; name: string; content?: string }) => ({ id: d.id, name: d.name, size: new Blob([d.content || ""]).size })));
    const { count, error: memoryError } = await supabase.from("agent_memories").select("id", { count: "exact", head: true });
    if (memoryError) { setLoadError("Could not load memories. Please try again."); return; }
    setLoadError("");
    setMemCount(count ?? 0);
  };
  useEffect(() => { void load(); measureCache(); }, []);
  const total = (docs || []).reduce((a, d) => a + d.size, 0);
  const clearCache = async () => {
    if (!(await askConfirm({ title: "Clear device cache?", body: "Saved page positions will reset. Your sign-in, preferences and Vault stay unchanged.", confirm: "Clear" }))) return;
    clearPageStates();
    measureCache(); toast.success("Cache cleared");
  };
  const remove = async (id: string) => {
    if (!(await askConfirm({ title: "Delete this file?", body: "Your agents will no longer be able to read it.", confirm: "Delete" }))) return;
    const { error } = await supabase.from("agent_documents").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("File deleted"); void load(); }
  };
  return (
    <Shell title="Storage" back={() => nav("/settings")}>
      {loadError && <Group><Row label={loadError} sub="Retry" onClick={() => void load()} /></Group>}
      <Group title="Overview">
        <Row label="Files" value={docs ? `${docs.length} · ${fmtBytes(total)}` : "…"} right={<span />} />
        <Row label="Memories" value={memCount === null ? "…" : String(memCount)} onClick={() => nav("/settings/memory")} />
        <Row label="Device cache" value={fmtBytes(cache)} right={<span />} />
      </Group>
      <Group><Row label="Clear device cache" sub="Keeps your sign-in and saved settings" onClick={clearCache} /></Group>
      <Group title="Files">
        {docs && !docs.length && <Row label="No files yet" sub="Files you send in chat appear here" right={<span />} />}
        {docs?.map((d) => <Row key={d.id} label={d.name} value={fmtBytes(d.size)} onClick={() => void remove(d.id)} right={<Trash2 size={16} />} />)}
      </Group>
    </Shell>
  );
}

const PLANS = [
  { id: "plus", name: "Plus", price: 20, yearly: 199, mult: "4x", base: "", groups: [
    { title: "Included", items: ["Ceyo Bot", "Newest Ceyo models", "Faster chat replies", "Create images and videos with AI", "Cloud agents and automation", "Code hosting and AI code reviews"] },
  ] },
  { id: "pro", name: "Pro", price: 60, yearly: 0, mult: "15x", base: "Plus", groups: [
    { title: "Included", items: ["Create 1080p videos", "Priority model access at peak times", "Faster replies and generations"] },
  ] },
  { id: "ultra", name: "Ultra", price: 120, yearly: 0, mult: "50x", base: "Pro", groups: [
    { title: "Included", items: ["Most capable chat models", "Early access to new products and models", "Fastest replies and generations"] },
  ] },
] as const;

function Plans({ nav }: { nav: Nav }) {
  const navigate = useNavigate();
  const { plan } = useUsage();
  const [tab, setTab] = useState(0);
  const [yearly, setYearly] = useState(false);
  const [paying, setPaying] = useState(false);
  useEffect(() => { const saved = readPageState(getAuthState().userId, "/settings/plans"); if (saved?.tab !== undefined) setTab(saved.tab); }, []);
  const chooseTab = (value: number) => {
    setTab(value); setYearly(false); setPaying(false);
    const owner = getAuthState().userId;
    writePageState(owner, "/settings/plans", { ...readPageState(owner, "/settings/plans"), tab: value });
  };
  const p = PLANS[tab];
  const localPrices = useLocalPlanPrices(p.id, p.yearly > 0);
  const current = plan?.toLowerCase() === p.id;
  const ar = useUserLang().startsWith("ar");
  const benefitsAr: Record<string, string> = {
    "Ceyo Bot": "بوت Ceyo", "Newest Ceyo models": "أحدث نماذج Ceyo", "Faster chat replies": "استجابات دردشة أسرع",
    "Create images and videos with AI": "إنشاء صور وفيديو بالذكاء الاصطناعي", "Cloud agents and automation": "وكلاء السحابة والأتمتة",
    "Code hosting and AI code reviews": "استضافة الكود ومراجعته بالذكاء الاصطناعي", "Create 1080p videos": "إنشاء مقاطع فيديو 1080p",
    "Priority model access at peak times": "أولوية الوصول إلى النماذج في أوقات الذروة", "Faster replies and generations": "استجابات وتوليدات أسرع",
    "Most capable chat models": "أقوى نماذج الدردشة", "Early access to new products and models": "الوصول المبكر إلى المنتجات والنماذج", "Fastest replies and generations": "أسرع الردود والتوليدات",
  };
  return (
    <div className="agent-hub ceyo-page subscription-page" data-no-translate dir={ar ? "rtl" : "ltr"}>
      <header className="subscription-header"><span className="subscription-brand">Ceyo</span><Button variant="ghost" size="icon" aria-label={ar ? "إغلاق" : "Close"} onClick={() => { if (window.history.state?.idx > 0) navigate(-1); else nav("/"); }}><X/></Button></header>
      <h1 className="subscription-title">{ar ? <>اشتراك واحد.<br/>الوصول إلى كل شيء.</> : <>One subscription.<br/>Access to everything.</>}</h1>
      <main className="subscription-content">
        <div className="subscription-tabs" role="tablist" aria-label="Plans">
          {PLANS.map((x,i) => <Button variant="ghost" key={x.id} role="tab" aria-selected={i === tab} aria-controls="subscription-details" onClick={() => chooseTab(i)}>{x.name}</Button>)}
        </div>
        <section id="subscription-details" role="tabpanel" aria-label={p.name}>
          {p.base && <p className="subscription-base">{ar ? `كل شيء في ${p.base}، و:` : `Everything in ${p.base}, and:`}</p>}
          <div className="subscription-usage"><b>{p.mult}</b><span>{ar ? "استخدام أكثر مقارنة بالخطة المجانية" : "more usage compared to Free"}</span></div>
          <h2 className="subscription-section-label">{ar ? "فوائد الذكاء الاصطناعي" : "AI benefits"}</h2>
          <ul className="subscription-benefits">{p.groups.flatMap(g => g.items).map(it => <li key={it}><Check/>{ar ? benefitsAr[it] || it : it}</li>)}</ul>
        </section>
      </main>
      <footer className="subscription-footer">
        <div className="subscription-intervals" role="group" aria-label="Billing interval">
          <Button variant="ghost" aria-pressed={!yearly} onClick={() => setYearly(false)}><strong dir="auto">{localPrices.monthly !== null && localPrices.currency ? formatLocalPrice(localPrices.monthly, localPrices.currency, ar ? "ar" : "en") : "…"}</strong><span>{ar ? "الفوترة شهريًا" : "Billed monthly"}</span></Button>
          {p.yearly > 0 && <Button variant="ghost" aria-pressed={yearly} onClick={() => setYearly(true)}><strong dir="auto">{localPrices.yearly !== null && localPrices.currency ? formatLocalPrice(localPrices.yearly, localPrices.currency, ar ? "ar" : "en") : "…"}</strong><span>{ar ? "سنويًا · وفر 17%" : "Yearly · Save 17%"}</span></Button>}
        </div>
        {localPrices.error && <Button variant="ghost" onClick={localPrices.retry}>{ar ? "تعذر تحميل السعر · إعادة المحاولة" : "Price unavailable · Retry"}</Button>}
        {localPrices.approximate && localPrices.ready && <p className="subscription-legal">{ar ? "سعر محلي تقريبي؛ المبلغ النهائي يُعرض عند الدفع." : "Approximate local price; final amount shown at checkout."}</p>}
        <Button variant="ghost" className="subscription-submit" disabled={current || !localPrices.ready} onClick={() => setPaying(true)}>{current ? ar ? "الخطة الحالية" : "Current plan" : ar ? "اشترك" : "Subscribe"}</Button>
        <p className="subscription-legal">{ar ? "تُجدد الاشتراكات تلقائيًا حتى الإلغاء. يمكنك الإلغاء في أي وقت. " : "Subscriptions renew automatically until cancelled. Cancel anytime. "}<a href="/subscription-terms">{ar ? "شروط الاشتراك" : "Subscription terms"}</a></p>
      </footer>
      {paying && <Suspense fallback={null}><CheckoutSheet tier={p.id} name={p.name} interval={yearly ? "yearly" : "monthly"} onClose={() => setPaying(false)} /></Suspense>}
    </div>
  );
}

type VaultItem = { id: string; kind: "login" | "card" | "contact"; title: string; detail: string };
const VAULT_KEY = "ceyo_vault_v1";

function Vault_({ nav }: { nav: Nav }) {
  const [tab, setTab] = useState<"all" | VaultItem["kind"]>("all");
  const [items, setItems] = useState<VaultItem[]>([]);
  const [adding, setAdding] = useState<VaultItem["kind"] | null>(null);
  const [menu, setMenu] = useState(false);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const [vaultKey, setVaultKey] = useState<string | null>(null);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      const key = `${VAULT_KEY}:${data.user.id}`;
      setVaultKey(key);
      try { const saved: unknown = JSON.parse(readSetting(key) || "[]"); setItems(Array.isArray(saved) ? saved.filter((item): item is VaultItem => Boolean(item && typeof item === "object" && "id" in item && "title" in item && "detail" in item && "kind" in item && typeof item.id === "string" && typeof item.title === "string" && typeof item.detail === "string" && ["login", "card", "contact"].includes(item.kind))) : []); } catch { setItems([]); }
    });
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);
  const save = (next: VaultItem[]) => { if (!vaultKey) return false; if (!saveSetting(vaultKey, JSON.stringify(next))) { toast.error("Could not save to this device."); return false; } setItems(next); return true; };
  const shown = items.filter((item) => (tab === "all" || item.kind === tab) && `${item.title} ${item.detail}`.toLowerCase().includes(query.toLowerCase()));
  const labels = { login: "Login", card: "Card", contact: "Contact info" } as const;
  const count = (kind: VaultItem["kind"]) => items.filter((item) => item.kind === kind).length;
  const openAdd = (kind: VaultItem["kind"]) => { setAdding(kind); setMenu(false); setTitle(""); setDetail(""); };
  return (
    <Shell
      className="ceyo-vault"
      title={adding ? `New ${labels[adding].toLowerCase()}` : "Vault"}
      back={() => adding ? setAdding(null) : nav("/settings")}
      action={!adding && <div className="hub-plus-wrap" ref={menuRef}>
        <Button variant="ghost" size="icon" type="button" className="gx-round" aria-label="Add vault item" aria-expanded={menu} onClick={() => setMenu((value) => !value)}><Plus size={21} /></Button>
        {menu && <div className="hub-menu hub-plus-menu ceyo-vault-menu" role="menu">
          <Button variant="ghost" type="button" role="menuitem" onClick={() => openAdd("login")}><KeyRound size={17} />Login</Button>
          <Button variant="ghost" type="button" role="menuitem" onClick={() => openAdd("card")}><CreditCard size={17} />Card</Button>
          <Button variant="ghost" type="button" role="menuitem" onClick={() => openAdd("contact")}><User size={17} />Contact info</Button>
        </div>}
      </div>}
    >
      {!adding && <div className="ceyo-vault-tabs" role="tablist" aria-label="Vault categories">
        {([["all", "All"], ["login", "Logins"], ["card", "Payments"], ["contact", "Contact info"]] as const).map(([kind, name]) => (
          <Button variant="ghost" type="button" role="tab" aria-selected={tab === kind} key={kind} data-active={tab === kind} onClick={() => setTab(kind)}>
            {name}<span>{kind === "all" ? items.length : count(kind)}</span>
          </Button>
        ))}
      </div>}
      {adding && <form className="ceyo-vault-editor" onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) return;
        try { validateVaultDetail(adding, detail); } catch (error) { toast.error(error instanceof Error ? error.message : "Invalid details"); return; }
        if (!save([{ id: crypto.randomUUID(), kind: adding, title: title.trim(), detail: detail.trim() }, ...items])) return;
        setAdding(null);
        toast.success("Saved to your vault");
      }}>
        <div className="ceyo-vault-fields">
          <label className="ceyo-vault-field"><span>{adding === "login" ? "Website" : adding === "card" ? "Card name" : "Label"}</span><input aria-label="Title" maxLength={100} placeholder={adding === "login" ? "example.com" : adding === "card" ? "e.g. Travel" : "e.g. Home"} value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></label>
          <label className="ceyo-vault-field"><span>{adding === "login" ? "Username or email" : adding === "card" ? "Last 4 digits" : "Contact details"}</span><input aria-label="Details" maxLength={adding === "card" ? 4 : 160} inputMode={adding === "card" ? "numeric" : "text"} pattern={adding === "card" ? "[0-9]{4}" : undefined} placeholder={adding === "login" ? "name@example.com" : adding === "card" ? "1234" : "Phone, email or address"} value={detail} onChange={(event) => setDetail(event.target.value)} /></label>
        </div>
        <p className="ceyo-vault-note">{adding === "card" ? "Only the last four digits are saved. Never enter a full card number or security code." : "Saved on this device, privately for your account."}</p>
        <Button variant="ghost" type="submit" className="ceyo-vault-save" disabled={!title.trim()}>{adding === "card" ? "Add card" : adding === "contact" ? "Save contact info" : "Save login"}</Button>
      </form>}
      {!adding && shown.length > 0 && <div className="ceyo-vault-list">{shown.map((item) => <div className="ceyo-vault-row" key={item.id}>
        <span className="ceyo-row-icon">{item.kind === "card" ? <CreditCard size={18} /> : item.kind === "login" ? <KeyRound size={18} /> : <User size={18} />}</span>
        <span><strong>{item.title}</strong><small>{item.detail}</small></span>
        <Button variant="ghost" size="icon" type="button" aria-label={`Delete ${item.title}`} onClick={() => save(items.filter((candidate) => candidate.id !== item.id))}><Trash2 size={16} /></Button>
      </div>)}</div>}
      {!shown.length && !adding && <div className="hub-empty-state"><span className="hub-empty-icon"><Vault size={22} /></span><strong>{items.length ? "No matching items" : "Your vault is empty"}</strong><p>{items.length ? "Try another search or category." : "Add a login, card label or contact info from the + button."}</p></div>}
      {!adding && <><p className="ceyo-vault-note">Ceyo never stores a saved card's full number or security code. Logins and contact info are saved on this device.</p>
      <div className="ceyo-bottom-search"><Search size={20} /><input aria-label="Search Vault" placeholder="Search Vault" value={query} onChange={(event) => setQuery(event.target.value)} /></div></>}
    </Shell>
  );
}

function Devices({ nav }: { nav: Nav }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const name = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone" : /Mac/i.test(ua) ? "Mac" : /Windows/i.test(ua) ? "Windows" : "This device";
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const signOutOthers = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) throw error;
      toast.success("Signed out of other devices");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not sign out other devices"); } finally { setBusy(false); }
  };
  return (
    <Shell title="Manage your devices" back={() => nav("/settings")}>
      <Group title="This device">
        <Row icon={<span className="ceyo-device-icon"><Smartphone size={19} /><i /></span>} label={name === "This device" ? "This device" : `${name} · This device`} value="Active now" onClick={() => setExpanded((value) => !value)} />
      </Group>
      {expanded && <Group title="Device details"><Row label="Platform" value={name} /><Row label="Time Zone" value={tz} /><Row label="Status" value="Current session" /></Group>}
      <Group><Row label={busy ? "Signing out…" : "Sign out of other devices"} disabled={busy} onClick={() => void signOutOthers()} /></Group>
      <p className="ceyo-note">Your current device stays signed in. Other active sessions are signed out.</p>
    </Shell>
  );
}

type PhoneCallRow = { id: string; direction: string; counterpart: string; status: string; purpose: string | null; summary: string | null; created_at: string };
const CALL_STATUS: Record<string, string> = { dialing: "Calling…", in_progress: "On the call", completed: "Done", no_answer: "No answer", failed: "Failed" };

async function phoneApi(body: Record<string, string>) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/phone", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Phone service unavailable");
  return json;
}

function Phone({ nav }: { nav: Nav }) {
  const [mobile, setMobile] = useState("");
  const [savedMobile, setSavedMobile] = useState("");
  const [bots, setBots] = useState<Array<{ id: string; name: string }>>([]);
  const [lines, setLines] = useState<Record<string, string>>({});
  const [calls, setCalls] = useState<PhoneCallRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    const [profile, botRows, numbers, callRows] = await Promise.all([
      supabase.from("profiles").select("phone_e164").eq("id", uid).maybeSingle(),
      supabase.from("bots").select("id,name").eq("owner_id", uid).order("created_at"),
      supabase.from("phone_numbers").select("bot_id,e164"),
      supabase.from("phone_calls").select("id,direction,counterpart,status,purpose,summary,created_at").order("created_at", { ascending: false }).limit(20),
    ]);
    const phone = profile.data?.phone_e164 || "";
    setSavedMobile(phone);
    setMobile((current) => current || phone);
    setBots(botRows.data || []);
    setLines(Object.fromEntries((numbers.data || []).filter((n: { bot_id: string | null }) => n.bot_id).map((n: { bot_id: string; e164: string }) => [n.bot_id, n.e164])));
    setCalls(callRows.data || []);
  };
  useEffect(() => {
    void load();
    void phoneApi({ action: "sync" }).then(load).catch(() => undefined);
  }, []);

  const saveMobile = async () => {
    const { normalizeE164 } = await import("@/lib/phone/phoneRules");
    const value = mobile.trim() ? normalizeE164(mobile) : null;
    if (mobile.trim() && !value) return toast.error("Use international format, e.g. +20 101 234 5678");
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").update({ phone_e164: value }).eq("id", auth.user?.id || "");
    if (error) return toast.error(error.message);
    setSavedMobile(value || "");
    setMobile(value || "");
    toast.success(value ? "Mobile number saved" : "Mobile number removed");
  };

  const toggleLine = async (botId: string) => {
    setBusy(botId);
    try {
      if (lines[botId]) {
        if (!(await askConfirm({ title: "Remove this number?", body: "People calling it will no longer reach this agent.", confirm: "Remove", danger: true }))) return;
        await phoneApi({ action: "release", botId });
        toast.success("Number removed");
      } else {
        const { number } = await phoneApi({ action: "assign", botId });
        toast.success(`Number ${number.e164} is now this agent's line`);
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the number");
    } finally { setBusy(null); }
  };

  const callTone = (status: string) => status === "completed" ? "ok" : status === "failed" || status === "no_answer" ? "bad" : status === "dialing" || status === "in_progress" ? "live" : undefined;

  return (
    <Shell title="Phone calls" back={() => nav("/settings")}>
      <h2 className="st-section">Your mobile number</h2>
      <form className="st-phone-field" onSubmit={(event) => { event.preventDefault(); void saveMobile(); }}>
        <input className="ceyo-input" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" aria-label="Your mobile number" placeholder="+20 101 234 5678" value={mobile} maxLength={24} onChange={(event) => setMobile(event.target.value)} />
        <button type="submit" className="st-btn" disabled={mobile.trim() === savedMobile}>Save</button>
      </form>
      <p className="st-hint">Ask any agent "call me" and it rings this number.</p>

      <Group title="Agent numbers">
        {bots.length ? bots.map((bot) => (
          <div className="st-line" key={bot.id}>
            <span className="st-call-icon" data-tone={lines[bot.id] ? "ok" : undefined}><PhoneIcon size={17} /></span>
            <span className="st-line-copy">
              <strong>{bot.name}</strong>
              <small dir="ltr">{lines[bot.id] ? formatPhone(lines[bot.id]) : "No number yet"}</small>
            </span>
            <button type="button" className="st-chip" data-tone={lines[bot.id] ? "danger" : "primary"} disabled={busy === bot.id} onClick={() => void toggleLine(bot.id)}>
              {busy === bot.id ? "…" : lines[bot.id] ? "Remove" : "Get number"}
            </button>
          </div>
        )) : <p className="st-empty">No agents yet.</p>}
      </Group>
      <p className="ceyo-note">Anyone who calls an agent's number talks to that agent. A summary of each call appears in its chat.</p>

      <Group title="Recent calls">
        {calls.length ? calls.map((call) => (
          <div className="st-line" key={call.id}>
            <span className="st-call-icon" data-tone={callTone(call.status) === "bad" ? "bad" : undefined}>{call.direction === "inbound" ? <PhoneIncoming size={17} /> : <PhoneOutgoing size={17} />}</span>
            <span className="st-line-copy">
              <strong dir="ltr" style={{ textAlign: "start" }}>{formatPhone(call.counterpart)}</strong>
              <small>{(call.summary || call.purpose || "").slice(0, 140) || (call.direction === "inbound" ? "Incoming call" : "Outgoing call")} · {callTime(call.created_at)}</small>
            </span>
            <span className="st-badge" data-tone={callTone(call.status)}>{CALL_STATUS[call.status] || call.status}</span>
          </div>
        )) : <p className="st-empty">No phone calls yet.</p>}
      </Group>
      <p className="ceyo-note">These are real phone calls: up to 10 a day, 10 minutes each. Agents only call when you ask them in the chat.</p>
    </Shell>
  );
}

/** "+201001234567" → "+20 100 123 4567"; "+12352047886" → "+1 235 204 7886". */
const DIAL_CODES = ["1", "20", "44", "966", "971", "965", "974", "973", "968", "962", "961", "212", "216", "213", "33", "49", "90"];
function formatPhone(raw: string) {
  const d = (raw || "").replace(/[^\d+]/g, "");
  if (!d.startsWith("+")) return raw;
  const cc = DIAL_CODES.filter((c) => d.slice(1).startsWith(c)).sort((a, b) => b.length - a.length)[0];
  if (!cc) return raw;
  const rest = d.slice(1 + cc.length);
  const parts = rest.length === 10 ? [rest.slice(0, 3), rest.slice(3, 6), rest.slice(6)] : rest.length === 9 ? [rest.slice(0, 2), rest.slice(2, 5), rest.slice(5)] : [rest];
  return `+${cc} ${parts.join(" ")}`;
}
function callTime(iso: string) {
  const t = new Date(iso); const mins = Math.round((Date.now() - t.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440 && t.getDate() === new Date().getDate()) return t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return t.toLocaleDateString([], { month: "short", day: "numeric" }) + ", " + t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function Computer({ nav }: { nav: Nav }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Shell title="Agent Computer" back={() => nav("/settings")}>
      <Group><Row label="Reset Computer" sub="No computer service connected" disabled right={<span />} /></Group>
      <p className="ceyo-note">Computer execution is unavailable. Web research and saved text files remain available.</p>
      {confirming && <div className="ceyo-card ceyo-confirm-card"><strong>Reset this computer?</strong><p>This requires a connected bot computer. Recent changes may be lost.</p><div className="hub-form-footer"><button type="button" className="hub-button hub-button-primary" onClick={() => { setConfirming(false); toast.error("No connected bot computer is available to reset"); }}>Reset</button><button type="button" className="hub-button hub-button-secondary" onClick={() => setConfirming(false)}>Cancel</button></div></div>}
      <Group><Row label="Connection" value="Not connected" right={<span />} /></Group>
    </Shell>
  );
}

function Permissions({ nav }: { nav: Nav }) {
  const [preferences, setPreferences] = useState<PermissionPreferences>(DEFAULT_PERMISSIONS);
  const [adding, setAdding] = useState<PermissionRuleKind | null>(null);
  const [text, setText] = useState("");
  useEffect(() => { setPreferences(parsePermissionPreferences(readSetting(PERMISSIONS_STORAGE_KEY))); }, []);
  const save = (next: PermissionPreferences) => { if (!saveSetting(PERMISSIONS_STORAGE_KEY, JSON.stringify(next))) { toast.error("Could not save this preference on your device."); return false; } setPreferences(next); return true; };
  const add = () => {
    if (!adding || !text.trim()) return;
    if (!save(addPermissionRule(preferences, adding, text))) return;
    setText("");
    setAdding(null);
    toast.success("Rule added");
  };
  const section = (kind: PermissionRuleKind, title: string, description: string) => <section className="ceyo-permission-section">
    <div className="ceyo-permission-head"><div><h2>{title}</h2><p>{description}</p></div><button type="button" onClick={() => { setAdding(kind); setText(""); }}>Add Rule</button></div>
    {adding === kind && <form className="ceyo-rule-form" onSubmit={(event) => { event.preventDefault(); add(); }}><input className="ceyo-input" value={text} maxLength={300} onChange={(event) => setText(event.target.value)} placeholder="Describe the action" autoFocus /><div><button type="submit" className="hub-button hub-button-primary" disabled={!text.trim()}>Save rule</button><button type="button" className="hub-button hub-button-secondary" onClick={() => setAdding(null)}>Cancel</button></div></form>}
    <div className="ceyo-rule-list">{preferences[kind].length ? preferences[kind].map((rule, index) => <div className="ceyo-rule" key={`${rule}-${index}`}><span>{rule}</span><button type="button" aria-label={`Delete rule ${rule}`} onClick={() => save(removePermissionRule(preferences, kind, index))}><Trash2 size={16} /></button></div>) : <p>No rules yet</p>}</div>
  </section>;
  return (
    <Shell title="Permissions" back={() => nav("/settings")}>
      <Group><Row label="Auto-Review" sub="Not connected to agent actions" checked={false} disabled right={<Toggle on={false} />} /></Group>
      {section("ask", "Always Ask", "Saved preferences for actions you want reviewed")}
      {section("allow", "Allow without Asking", "Saved preferences; these do not authorize actions")}
      <p className="ceyo-note ceyo-permission-note">Rules are saved only on this device and are not enforced. External actions still require their own approval.</p>
    </Shell>
  );
}

const MEMORY_PROMPT = `Export all of my stored memories and any context you've learned about me from past conversations. Preserve my words verbatim where possible, especially for instructions and preferences.\n\nCategories (output in this order):\n1. Instructions: Rules I've explicitly asked you to follow.\n2. Preferences: How I like answers formatted and delivered.\n3. Projects: Ongoing work, goals and important context.\n4. People: Names and relationships that matter to me.\n\nOutput only the memory list.`;

function Memory({ nav }: { nav: Nav }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [memories, setMemories] = useState<{ id: string; content: string }[]>([]);
  const [error, setError] = useState("");
  const refresh = async () => {
    const { data, error } = await supabase.from("agent_memories").select("id,content").order("created_at", { ascending: false });
    setError(error?.message || ""); setMemories(data || []);
  };
  useEffect(() => { void refresh(); }, []);
  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(MEMORY_PROMPT); toast.success("Prompt copied"); } catch { toast.error("Could not copy the prompt"); }
  };
  const add = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Sign in first");
      const { error } = await supabase.from("agent_memories").insert({ user_id: data.user.id, content: text.trim().slice(0, 5000) });
      if (error) throw error;
      setText("");
      toast.success("Memory added");
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add memory"); } finally { setSaving(false); }
  };
  return (
    <Shell title="Import Memory" back={() => nav("/settings")}>
      <section className="ceyo-memory-step"><h2>1. Copy this prompt into a chat with your other AI assistant</h2><div className="ceyo-memory-prompt"><p>{MEMORY_PROMPT}</p><button type="button" onClick={() => void copyPrompt()}><Copy size={16} />Copy prompt</button></div></section>
      <section className="ceyo-memory-step"><h2>2. Paste the results below to add them to Ceyo Bot's memory</h2><textarea className="ceyo-input ceyo-textarea" maxLength={5000} placeholder="Paste your memory details here" value={text} onChange={(event) => setText(event.target.value)} /></section>
      <button type="button" className="st-btn st-btn-wide" disabled={!text.trim() || saving} onClick={() => void add()}>{saving ? "Adding…" : "Add to Memory"}</button>
      {error && <p role="alert" className="st-hint">{error}</p>}
      <div style={{ height: 28 }} />
      <Group title={`Saved memories${memories.length ? ` · ${memories.length}` : ""}`}>
        <div className="st-memory-list">
          {memories.length ? memories.map((memory) => <Row key={memory.id} label={memory.content} onClick={async () => {
            if (!(await askConfirm({ title: "Delete this memory?", body: "Your agents will forget it.", confirm: "Delete", danger: true }))) return;
            const { error } = await supabase.from("agent_memories").delete().eq("id", memory.id);
            if (error) toast.error(error.message); else await refresh();
          }} right={<Trash2 size={16} className="ceyo-row-chev" />} />) : <p className="st-empty">No saved memories yet.</p>}
        </div>
      </Group>
    </Shell>
  );
}

type SurfaceMode = "black" | "bot";
function applySurface(mode: SurfaceMode) {
  document.documentElement.dataset.ceyoSurface = mode;
  saveSetting("ceyo_surface", mode);
}

function Appearance({ nav }: { nav: Nav }) {
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [surface, setSurface] = useState<SurfaceMode>("black");
  useEffect(() => {
    setMode(getStoredTheme());
    const saved = readSetting("ceyo_surface") === "bot" ? "bot" : "black";
    setSurface(saved);
    applySurface(saved);
  }, []);
  const options: [ThemeMode, string, ReactNode][] = [["system", "Follow System", <Contrast size={28} />], ["light", "Light", <Sun size={28} />], ["dark", "Dark", <Moon size={28} />]];
  const chooseSurface = (value: SurfaceMode) => { setSurface(value); applySurface(value); };
  return (
    <Shell title="Appearance" back={() => nav("/settings")}>
      <h2 className="st-section">Theme</h2>
      <div className="ceyo-theme-grid" style={{ marginBottom: 28 }}>{options.map(([value, label, icon]) => <button type="button" key={value} data-active={mode === value} onClick={() => { setTheme(value); setMode(value); }}><span>{icon}</span><strong>{label}</strong></button>)}</div>
      <h2 className="st-section">Chat background</h2>
      <div className="ceyo-surface-grid">
        <button type="button" data-active={surface === "black"} onClick={() => chooseSurface("black")}><span><i className="ceyo-black-dot" /></span><strong>Black</strong></button>
        <button type="button" data-active={surface === "bot"} onClick={() => chooseSurface("bot")}><span><i className="ceyo-bot-color-dot" /></span><strong>Bot color</strong></button>
      </div>
    </Shell>
  );
}

const LANGUAGES: [string, string][] = [
  ["system", "System"], ["ar", "العربية"], ["zh-CN", "简体中文"], ["zh-TW", "繁體中文"],
  ["en", "English"], ["hi", "हिन्दी"], ["pl", "Polski"], ["es", "Español"],
  ["pt", "Português"], ["ja", "日本語"], ["fr", "Français"], ["ko", "한국어"],
  ["de", "Deutsch"], ["tr", "Türkçe"],
];

function Language({ nav }: { nav: Nav }) {
  const [selected, setSelected] = useState("system");
  useEffect(() => { setSelected(readSetting("ceyo_language") || "system"); }, []);
  const choose = (code: string) => {
    if (!saveSetting("ceyo_language", code)) { toast.error("Could not save this preference on your device."); return; }
    setSelected(code);
    window.dispatchEvent(new CustomEvent("ceyo:language", { detail: code }));
    toast.success("Language saved");
  };
  return (
    <Shell title="Language" back={() => nav("/settings")}>
      <Group>{LANGUAGES.map(([code, label]) => <Row key={code} label={label} onClick={() => choose(code)} right={selected === code ? <Check size={18} /> : <span />} />)}</Group>
      <p className="ceyo-note">Your language choice is saved on this device.</p>
    </Shell>
  );
}

const PLAY_BILLING = "https://play.google.com/store/account/subscriptions";

/** Google Play owns the card, the receipts and the cancellation. */
function Subscription({ nav }: { nav: Nav }) {
  const { plan, data } = useUsage();
  const [provider, setProvider] = useState<string | null>(null);
  useEffect(() => { void supabase.from("subscriptions").select("provider").gt("current_period_end", new Date().toISOString()).maybeSingle().then(({ data }) => setProvider(data?.provider || null)); }, []);
  const play = provider === "google_play";
  const openBilling = () => window.open(PLAY_BILLING, "_blank", "noopener");
  return (
    <Shell title="Manage Subscription" back={() => nav("/settings")}>
      <Group>
        <Row label="Current plan" value={plan.charAt(0).toUpperCase() + plan.slice(1)} right={<span />} />
        {play && <Row label="Manage subscription in Google Play" onClick={openBilling} right={<Ext />} />}
        <Row label="Subscribe" sub="Choose a Ceyo plan." onClick={() => nav("/settings/plans")} />
        {play && <Row label="Cancel subscription" sub="Cancel through Google Play." onClick={openBilling} right={<Ext />} />}
      </Group>
      {data?.isPaid && !play && <p className="ceyo-sub-note">Manage your subscription using the link in your payment receipt.</p>}
    </Shell>
  );
}

function Feedback({ nav }: { nav: Nav }) {
  const live = useWorkspaceStore() as { agents?: { name?: string }[] };
  const [text, setText] = useState("");
  const [bot, setBot] = useState("None");
  const [pick, setPick] = useState(false);
  const names = ["None", ...new Set((live.agents || []).map((a) => a.name).filter(Boolean) as string[])];

  // Opening settings straight from a cold start leaves the bot list empty.
  useEffect(() => {
    if (!(live.agents || []).length) void loadWorkspace();
  }, [live.agents]);

  const send = () => {
    const body = encodeURIComponent(`${text.trim()}\n\nBot: ${bot}`);
    window.location.href = `mailto:support@ceyo.si?subject=Ceyo%20feedback&body=${body}`;
    toast("Send the draft in your email app to submit feedback.");
  };

  return (
    <Shell title="Send Feedback" back={() => nav("/settings")}>
      <div className="ceyo-fb">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened? What did you expect?" />
        <p>We value all feedback, whether it&apos;s a bug, an idea, or a question.</p>
        <span className="ceyo-fb-label">Was your issue with a specific Bot?</span>
        <button type="button" className="ceyo-fb-pick" aria-expanded={pick} onClick={() => setPick((v) => !v)}>
          <span>Bot</span>
          <span>{bot} <ChevronsUpDown size={16} /></span>
        </button>
        {pick && (
          <div className="ceyo-fb-list">
            {names.map((n) => (
              <button key={n} type="button" onClick={() => { setBot(n); setPick(false); }}>{n}</button>
            ))}
          </div>
        )}
      </div>
      <div className="ceyo-fb-foot">
        <button type="button" className="ceyo-fb-send" disabled={!text.trim()} onClick={send}>Send Feedback</button>
      </div>
    </Shell>
  );
}

export default function CeyoSettings() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const nav: Nav = useCallback((to) => navigate(to), [navigate]);
  const [, , section] = pathname.split("/");
  switch (section) {
    case "account": return <Account nav={nav} />;
    case "usage": return <Usage nav={nav} />;
    case "storage": return <Storage nav={nav} />;
    case "plans": return <Plans nav={nav} />;
    case "subscription": return <Subscription nav={nav} />;
    case "feedback": return <Feedback nav={nav} />;
    case "vault": return <Vault_ nav={nav} />;
    
    case "devices": return <Devices nav={nav} />;
    case "computer": return <Computer nav={nav} />;
    case "phone": return <Phone nav={nav} />;
    case "permissions": return <Permissions nav={nav} />;
    case "memory": return <Memory nav={nav} />;
    case "appearance": return <Appearance nav={nav} />;
    case "language": return <Language nav={nav} />;
    default: return <Main nav={nav} />;
  }
}
