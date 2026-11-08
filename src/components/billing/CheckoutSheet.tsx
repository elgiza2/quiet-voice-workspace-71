/** Subscribe popup: Kashier Direct API (card / Vodafone Cash, EGP) in Egypt, Dodo elsewhere, Google Play on Android. */
import { useEffect, useState } from "react";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/legacyClient";
import { playProductId, priceOf, type BillingInterval, type Tier } from "@/lib/payments/plans";
import { CREDITS_CHANGED_EVENT } from "@/hooks/useCredits";
import { Button } from "@/components/ui/button";
import { InlineDodoCheckout } from "./InlineDodoCheckout";
import { CheckoutBox } from "./CheckoutBox";
import { useUserLang } from "@/lib/authI18n";
import "@/styles/checkout-box.css";
import { isPlayApp, purchasePlay } from "@/lib/native/playBilling";
import { kashierCardPayload } from "@/lib/payments/kashierCard";
import { getAuthState } from "@/lib/authStore";

type PlayApi = { purchase?: (json: string) => void };
declare global { interface Window { ceyoPlayPurchase?: (token: string) => void } }
const playApi = () => (typeof window !== "undefined" ? ((window as unknown as { MegsyAndroid?: PlayApi }).MegsyAndroid ?? null) : null);
type Quote = { country: string; provider: "kashier" | "dodo"; methods: string[]; amount: number; currency: string };

async function billing<T = Record<string, unknown>>(body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/billing", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Payment could not start");
  return json as T;
}

const money = (amount: number, currency: string) => {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: currency === "EGP" ? 0 : 2 }).format(amount); }
  catch { return `${amount} ${currency}`; }
};
const digits = (v: string, n: number) => v.replace(/\D/g, "").slice(0, n);

export function CheckoutSheet({ tier, name, interval, onClose }: { tier: Tier; name: string; interval: BillingInterval; onClose: () => void }) {
  const usd = priceOf(tier, interval) ?? 0;
  const ar = useUserLang().startsWith("ar");
  const native = playApi();
  const playNative = isPlayApp();
  const androidBilling = playNative || !!native;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [chosen, setChosen] = useState(false);
  const [method, setMethod] = useState<"card" | "wallet">("card");
  const [card, setCard] = useState({ number: "", name: "", exp: "", cvv: "" });
  const [phone, setPhone] = useState("");
  const [frame, setFrame] = useState("");
  const [orderId, setOrderId] = useState("");
  const [check, setCheck] = useState<"" | "db" | "wallet" | "dodo">("");
  const [state, setState] = useState<"idle" | "loading" | "waiting" | "paid" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const previous = document.body.style.overflow;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    const previousFocus = document.activeElement;
    const dialog = document.querySelector<HTMLElement>(".cbox-screen");
    dialog?.focus();
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input, a[href], iframe"));
      const first = items[0], last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {e.preventDefault(); last.focus();}
      else if (!e.shiftKey && document.activeElement === last) {e.preventDefault(); first.focus();}
    };
    document.addEventListener("keydown", onTab);
    return () => {document.body.style.overflow = previous;document.removeEventListener("keydown",onKey);document.removeEventListener("keydown",onTab);if (previousFocus instanceof HTMLElement) previousFocus.focus();};
  }, [onClose]);

  useEffect(() => {
    if (androidBilling) return;
    billing<Quote>({ action: "quote", tier, interval, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "" })
      .then(setQuote).catch((e) => setError((e as Error).message));
  }, [tier, interval, androidBilling]);

  const done = () => { setState("paid"); window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT)); };

  // Only the server (verified webhook, wallet reconcile or Dodo lookup) can mark the order paid.
  useEffect(() => {
    if (!orderId || state !== "waiting") return;
    const t = setInterval(async () => {
      let status = "";
      if (check === "wallet") status = (await billing<{ status: string }>({ action: "kashier_wallet_check", orderId }).catch(() => ({ status: "" }))).status;
      else if (check === "dodo") status = (await billing<{ status: string }>({ action: "dodo_check", orderId }).catch(() => ({ status: "" }))).status;
      else status = (await supabase.from("payment_orders").select("status").eq("id", orderId).maybeSingle()).data?.status ?? "";
      if (status === "paid") done();
      if (status === "failed") { setState("error"); setError("The payment was declined."); setFrame(""); }
    }, 4000);
    return () => clearInterval(t);
  }, [orderId, state, check]);

  const fail = (e: unknown) => { setState("error"); setError((e as Error).message); };

  const payPlay = async () => {
    setState("loading");
    const { data } = await supabase.auth.getUser();
    if (playNative) {
      try {
        if (!data.user) throw new Error("Please sign in first");
        const token = await purchasePlay(playProductId(tier, interval), data.user.id);
        await billing({ action: "play", tier, interval, purchaseToken: token });
        done();
      } catch (e) { fail(e); }
      return;
    }
    window.ceyoPlayPurchase = async (token) => {
      try { await billing({ action: "play", tier, interval, purchaseToken: token }); done(); } catch (e) { fail(e); }
    };
    native?.purchase?.(JSON.stringify({ productId: playProductId(tier, interval), accountId: data.user?.id }));
  };

  const payCard = async () => {
    const [mm, yy] = card.exp.split("/");
    if (card.number.length < 13 || !card.name.trim() || !mm || !yy || card.cvv.length < 3) { setError("Check your card details."); return; }
    setState("loading"); setError("");
    try {
      const customerReference = getAuthState().userId;
      if (!customerReference) throw new Error("Please sign in first");
      const o = await billing<{ orderId: string; merchantId: string; amount: number; currency: string; hash: string; endpoint: string; webhookUrl: string; redirect: string }>({ action: "kashier_card", tier, interval });
      // Card details go straight from this device to Kashier; Ceyo's servers never see them.
      const res = await fetch(o.endpoint, { method: "POST", headers: { "Content-Type": "application/json", "Kashier-Hash": o.hash }, body: JSON.stringify(kashierCardPayload(o, card, customerReference, `Ceyo ${name} ${interval}`)) });
      const p = await res.json().catch(() => ({}));
      const url = p?.response?.authentication?.redirectUrl;
      setCard({ number: "", name: "", exp: "", cvv: "" });
      setOrderId(o.orderId); setCheck("db");
      if (url && /^https:\/\/([a-z0-9-]+\.)*kashier\.io\//.test(url)) { setFrame(url); setState("waiting"); return; }
      if (p?.status === "SUCCESS") { setState("waiting"); return; }
      throw new Error(p?.messages?.en || p?.message || "The card was declined.");
    } catch (e) { fail(e); }
  };

  const payWallet = async () => {
    setState("loading"); setError("");
    try {
      const o = await billing<{ orderId: string }>({ action: "kashier_wallet", tier, interval, phone });
      setOrderId(o.orderId); setCheck("wallet"); setState("waiting");
    } catch (e) { fail(e); }
  };

  const payDodo = async () => {
    setState("loading"); setError("");
    try {
      const o = await billing<{ orderId: string; url: string }>({ action: "dodo", tier, interval, country: quote?.country ?? "" });
      setOrderId(o.orderId); setCheck("dodo"); setState("waiting");
      setFrame(o.url);
    } catch (e) { fail(e); }
  };

  const total = androidBilling ? `$${usd}` : quote ? money(quote.amount, quote.currency) : "…";
  const busy = state === "loading";
  const kashier = quote?.provider === "kashier";
  const reset = () => { setChosen(false); setState("idle"); setFrame(""); setError(""); setOrderId(""); };
  const errorBox = error ? <p role="alert" className="cbox-error">{error}</p> : null;
  const heading = state === "paid" ? "Payment complete" : state === "waiting" ? (frame ? "Secure payment" : "Confirming payment") : androidBilling ? "Google Play" : method === "wallet" ? "Vodafone Cash" : "Card details";
  const content = state === "paid" ? (
    <div className="cbox-status" role="status"><span className="cbox-success"><Check /></span><h3>You're subscribed</h3><p>Ceyo {name} is now active.</p><Button variant="ghost" className="cbox-cta" onClick={onClose}>Continue</Button></div>
  ) : state === "waiting" ? (
    <>
      {check === "dodo" && frame ? <InlineDodoCheckout url={frame} /> : check === "db" && frame ? <div className="cbox-embedded"><iframe title="Bank verification" src={frame} allow="payment *" /></div> : <div className="cbox-status" role="status"><Loader2 className="cbox-spin" /><h3>{check === "wallet" ? "Approve on your phone" : "Confirming your payment"}</h3>{check === "wallet" && <p>Request sent to {phone}. Approve in Ana Vodafone or dial *9#.</p>}</div>}
      <p className="cbox-security"><ShieldCheck /> Activation follows verified payment.</p>
    </>
  ) : androidBilling ? (
    <>{errorBox}<Button variant="ghost" className="cbox-cta" disabled={busy} onClick={() => void payPlay()}>{busy ? <Loader2 className="cbox-spin" /> : "Subscribe with Google Play"}</Button></>
  ) : !kashier ? (
    <>{errorBox}<Button variant="ghost" className="cbox-cta" disabled={busy} onClick={() => void payDodo()}>{busy ? <Loader2 className="cbox-spin" /> : `Subscribe · ${total}`}</Button></>
  ) : method === "card" ? (
    <form onSubmit={(e) => { e.preventDefault(); void payCard(); }} className="cbox-form">
      <Field label={ar ? "رقم البطاقة" : "Card number"}><input required inputMode="numeric" autoComplete="cc-number" dir="ltr" value={card.number.replace(/(.{4})/g, "$1 ").trim()} onChange={(e) => setCard({ ...card, number: digits(e.target.value, 19) })} placeholder="1234 5678 9012 3456" /></Field>
      <Field label={ar ? "الاسم على البطاقة" : "Name on card"}><input required autoComplete="cc-name" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value.slice(0, 60) })} placeholder="Full name" /></Field>
      <div className="cbox-field-pair">
        <Field label={ar ? "تاريخ الانتهاء" : "Expiry"}><input required inputMode="numeric" autoComplete="cc-exp" value={card.exp.replace("/", " / ")} onChange={(e) => { const d = digits(e.target.value, 4); setCard({ ...card, exp: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }); }} placeholder="MM / YY" /></Field>
        <Field label="CVV"><input required type="password" inputMode="numeric" autoComplete="cc-csc" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: digits(e.target.value, 4) })} placeholder="•••" /></Field>
      </div>
      {errorBox}<Button variant="ghost" type="submit" disabled={busy} className="cbox-cta">{busy ? <Loader2 className="cbox-spin" /> : `Subscribe · ${total}`}</Button>
      <p className="cbox-security"><ShieldCheck /> Secure payment by Kashier</p>
    </form>
  ) : (
    <form onSubmit={(e) => { e.preventDefault(); void payWallet(); }} className="cbox-form">
      <Field label={ar ? "رقم المحفظة" : "Wallet number"}><input required inputMode="tel" autoComplete="tel-national" aria-label="Vodafone Cash wallet number" value={phone} onChange={(e) => setPhone(digits(e.target.value, 11))} placeholder="01x xxxx xxxx" /></Field>
      <p className="cbox-note">Approve the payment request on your phone.</p>{errorBox}
      <Button variant="ghost" type="submit" disabled={busy} className="cbox-cta">{busy ? <Loader2 className="cbox-spin" /> : `Subscribe · ${total}`}</Button>
    </form>
  );
  if (typeof document === "undefined") return null;
  return createPortal(
    <section className="cbox-screen" dir="ltr" role="dialog" aria-modal="true" aria-label="Checkout" tabIndex={-1} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="cbox-wrap">
        <Button variant="ghost" type="button" className="cbox-close" aria-label="Close" title="Close" onClick={onClose}><X /></Button>
        <CheckoutBox name={`Ceyo ${name}`} subtitle={interval === "yearly" ? "Yearly subscription" : "Monthly subscription"} total={total}
          kashier={androidBilling ? false : quote ? kashier : null} busy={busy} error={error} heading={heading}
          onBack={state === "paid" || androidBilling ? undefined : reset}
          onPay={(m) => { setError(""); setChosen(true); if (m === "google_pay" || !kashier) void payDodo(); else setMethod(m === "wallet" ? "wallet" : "card"); }}>
          {chosen || androidBilling || state === "paid" ? content : undefined}
        </CheckoutBox>
      </div>
    </section>, document.body
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="cbox-field"><span>{label}</span>{children}</label>;
}
