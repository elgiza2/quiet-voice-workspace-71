/** Pure phone-call rules shared by the agent tool, server sync and tests. */

export const PHONE_DAILY_CALL_LIMIT = 10;
export const PHONE_CALL_MAX_SECONDS = 600;
export const PHONE_RING_TIMEOUT_SECONDS = 40;

const E164 = /^\+[1-9]\d{7,14}$/;

/** Accepts "+20 101 234 5678", "0020-101…", "(+1) 235…" and returns +E.164, or null. */
export function normalizeE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = raw.trim().replace(/[\s\-().]/g, "");
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  return E164.test(v) ? v : null;
}

/** True when the message text contains the number (international or local form). */
export function numberMentioned(text: string, e164: string) {
  const digits = text.replace(/[^\d]/g, "");
  const tail = e164.replace(/[^\d]/g, "").slice(-8);
  return tail.length === 8 && digits.includes(tail);
}

const NEGATED = /(?:don't|do not|stop|cancel|no more|never)\s+(?:call|ring|phone|dial)|(?:مت|ما\s*ت|مات|بلاش\s*ت?)(?:رن|تصل|كلم)|(?:وقف|بطل|الغ[يى])[^.!؟\n]{0,25}(?:رن|مكالم|اتصال)/i;
const ASKS = /\b(?:call|phone|ring|dial)\b|اتصل|اتّصل|تتصل|يتصل|كلم|كلّم|تكلم|رن\s|رنّ|مكالم/i;

/** A phone call is authorized only by an explicit request in the latest user message. */
export function requestsPhoneCall(text: string) {
  return !NEGATED.test(text) && ASKS.test(text);
}

/** "Call me" / "كلمني" — the user's own saved number. */
export function asksToCallMe(text: string) {
  return /\b(?:call|ring|phone)\s+me\b|كلمني|كلّمني|اتصل\s*(?:بي|بيا|عليا|علي[اّ])|رن\s*(?:عليا|علي[اّ])|كلمني\s*على/i.test(text);
}

/** One phone call per user message and destination, so tool retries never dial twice. */
export async function phoneCallId(conversationId: string, messageId: string, to: string) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`phone:${conversationId}:${messageId}:${to}`)));
  hash[6] = (hash[6] & 15) | 80; hash[8] = (hash[8] & 63) | 128;
  const s = Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

export function isArabic(text: string) {
  const ar = (text.match(/\p{Script=Arabic}/gu) || []).length;
  const latin = (text.match(/[a-z]/gi) || []).length;
  return ar > 0 && ar >= latin;
}

const VOICES = { male: "Telnyx.Bayan.Ahmed", female: "Telnyx.Bayan.Nada" } as const;
/** Bayan speaks Egyptian/other Arabic dialects and English; the choice is stable per bot. */
export function phoneVoice(botId: string, gender?: string | null) {
  if (gender === "female" || gender === "male") return VOICES[gender];
  const n = [...botId].reduce((a, c) => a + c.charCodeAt(0), 0);
  return n % 2 ? VOICES.female : VOICES.male;
}

export type Turn = { role: "user" | "assistant"; text: string };

export function transcriptTurns(messages: Array<{ role?: string; content?: unknown; text?: unknown }>): Turn[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as Turn["role"], text: String(m.content ?? m.text ?? "").trim() }))
    .filter((t) => t.text);
}

export function finalStatus(turns: Turn[]): "completed" | "no_answer" {
  return turns.some((t) => t.role === "user") ? "completed" : "no_answer";
}

type PromptInput = { botName: string; botInstructions?: string | null; ownerName?: string | null; goal?: string | null; direction: "outbound" | "inbound"; counterpart?: string | null; callingOwner?: boolean };

export function phoneInstructions(p: PromptInput) {
  const owner = p.ownerName?.trim() || "your user";
  const role = p.direction === "inbound"
    ? `You are answering an incoming phone call on behalf of ${owner}. Find out who is calling and why, help if you can, take a clear message otherwise, and never promise anything ${owner} has not approved.`
    : p.callingOwner
      ? `You are calling ${owner} (your own user) on their phone. Goal of this call: ${p.goal}`
      : `You are making a phone call on behalf of ${owner} to ${p.counterpart || "another party"}. Introduce yourself as ${owner}'s AI assistant at the start. Goal of this call: ${p.goal}`;
  return `You are ${p.botName}, speaking on a live phone call.
${role}

Phone rules:
- Speak naturally and briefly: one or two short sentences per turn. No markdown, lists, emojis, links or code.
- Speak the language and dialect the other person uses. Egyptian Arabic stays natural Egyptian Arabic.
- Never share ${owner}'s private details beyond what the goal needs. Never agree to payments, contracts or sharing codes/passwords.
- If you reach voicemail, leave one short message with the purpose and hang up.
- When the goal is done or the other person wants to end, say goodbye and use the hangup tool.
${p.botInstructions?.trim() ? `\nYour personality and specialization (keep it, but these phone rules win):\n${p.botInstructions.trim().slice(0, 4000)}` : ""}`;
}

export function phoneGreeting(p: { botName: string; ownerName?: string | null; arabic: boolean; direction: "outbound" | "inbound"; callingOwner?: boolean }) {
  const owner = p.ownerName?.trim();
  if (p.direction === "inbound") return p.arabic ? `أهلًا، معاك ${p.botName}${owner ? `، مساعد ${owner}` : ""}. أقدر أساعدك إزاي؟` : `Hi, this is ${p.botName}${owner ? `, ${owner}'s assistant` : ""}. How can I help?`;
  if (p.callingOwner) return p.arabic ? `أهلًا، أنا ${p.botName}.` : `Hi, it's ${p.botName}.`;
  return p.arabic ? `السلام عليكم، معاك ${p.botName}، المساعد الذكي${owner ? ` لـ ${owner}` : ""}.` : `Hello, this is ${p.botName}, an AI assistant calling${owner ? ` on behalf of ${owner}` : ""}.`;
}
