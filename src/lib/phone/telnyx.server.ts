/** Server-only Telnyx telephony: agent assistants, outbound dialing, number lines and call sync.
 *  Telnyx is the source of truth for call state; webhooks only trigger a re-fetch. */
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getProviderKey } from "@/lib/keys/providerKey";
import {
  PHONE_CALL_MAX_SECONDS, PHONE_DAILY_CALL_LIMIT, PHONE_RING_TIMEOUT_SECONDS, finalStatus, isArabic,
  phoneGreeting, phoneInstructions, phoneVoice, transcriptTurns, type Turn,
} from "./phoneRules";

const API = "https://api.telnyx.com/v2";
const PHONE_MODEL = "moonshotai/Kimi-K2.6";
const OUTBOUND_COUNTRIES = ["US", "CA", "EG", "SA", "AE", "KW", "QA", "BH", "OM", "JO", "GB", "DE", "FR"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

export class PhoneUnavailable extends Error {}

export function webhookUrl() {
  const base = (process.env.PUBLIC_APP_URL || "https://ceyo.si").replace(/\/$/, "");
  return `${base}/api/public/telnyx-voice`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function tx<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = await getProviderKey("telnyx");
  if (!key) throw new PhoneUnavailable("Phone calls are not configured");
  const res = await fetch(`${API}${path}`, {
    method: init.method || (init.body ? "POST" : "GET"),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const e = json?.errors?.[0];
    const err = new Error(`Telnyx ${res.status}: ${e?.detail || e?.title || "request failed"}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json as T;
}

async function setting(key: string) {
  const { data } = await db().from("telephony_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string | undefined) || null;
}
async function saveSetting(key: string, value: string) {
  const { error } = await db().from("telephony_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/** One outbound profile (spend-capped) and one Call Control app for agent dialing. */
export async function ensureCallControlApp(): Promise<string> {
  const saved = await setting("call_control_app_id");
  if (saved) return saved;
  let profileId = await setting("outbound_profile_id");
  if (!profileId) {
    // Entry-level Telnyx accounts may hold a single profile: reuse ours, else the existing one.
    const found = await tx("/outbound_voice_profiles");
    const list = (found.data ?? []) as Array<{ id: string; name: string }>;
    const existing = list.find((p) => p.name === "Ceyo agents outbound") || list[0];
    if (existing) { profileId = String(existing.id); await saveSetting("outbound_profile_id", profileId); }
  }
  if (!profileId) {
    const body = (countries: string[]) => ({
      name: "Ceyo agents outbound", traffic_type: "conversational", service_plan: "global",
      whitelisted_destinations: countries, daily_spend_limit: "3.00", daily_spend_limit_enabled: true,
    });
    const allowed = await tx("/outbound_voice_profiles", { body: body(OUTBOUND_COUNTRIES) }).then(
      (profile) => ({ profile, full: true }),
      async (e) => ({ profile: await tx("/outbound_voice_profiles", { body: body(allowedCountries(e)) }), full: false }),
    );
    profileId = String(allowed.profile.data.id);
    await saveSetting("outbound_profile_id", profileId);
    if (allowed.full) await saveSetting("outbound_full", "1");
  }
  const apps = await tx("/call_control_applications?filter[application_name][contains]=Ceyo agents");
  const known = (apps.data ?? []).find((a: { application_name: string }) => a.application_name === "Ceyo agents");
  if (known) { await saveSetting("call_control_app_id", String(known.id)); return String(known.id); }
  const app = await tx("/call_control_applications", { body: {
    application_name: "Ceyo agents", webhook_event_url: webhookUrl(), anchorsite_override: "Latency",
    outbound: { outbound_voice_profile_id: profileId },
  } });
  const id = String(app.data.id);
  await saveSetting("call_control_app_id", id);
  return id;
}

/** Telnyx lists the countries an unverified account may not call yet; keep the rest. */
function allowedCountries(e: unknown) {
  const message = (e as Error).message || "";
  if (!/upgrade/i.test(message)) throw e;
  const blocked = new Set(message.match(/\b[A-Z]{2}\b/g) || []);
  return OUTBOUND_COUNTRIES.filter((c) => !blocked.has(c));
}

/** After the Telnyx account is upgraded, open the remaining countries (checked at most hourly). */
async function widenDestinations() {
  if (await setting("outbound_full")) return;
  const last = Number(await setting("outbound_widen_at")) || 0;
  if (Date.now() - last < 3_600_000) return;
  await saveSetting("outbound_widen_at", String(Date.now()));
  const profileId = await setting("outbound_profile_id");
  if (!profileId) return;
  const ok = await tx(`/outbound_voice_profiles/${profileId}`, { method: "PATCH", body: { whitelisted_destinations: OUTBOUND_COUNTRIES } }).then(() => true, () => false);
  if (ok) await saveSetting("outbound_full", "1");
}

type Bot = { id: string; owner_id: string; name: string; instructions: string | null; look: Record<string, unknown> | null };

async function ownerName(userId: string) {
  const { data } = await db().from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return (data?.display_name as string | null) || null;
}

/** Each bot gets its own Telnyx assistant; its TeXML app answers that bot's number. */
export async function ensureBotAssistant(bot: Bot): Promise<{ assistantId: string; texmlAppId: string | null }> {
  const owner = await ownerName(bot.owner_id);
  const gender = (bot.look?.voiceSettings as { gender?: string } | undefined)?.gender;
  const instructions = phoneInstructions({ botName: bot.name, botInstructions: bot.instructions, ownerName: owner, direction: "inbound" });
  const greeting = phoneGreeting({ botName: bot.name, ownerName: owner, arabic: true, direction: "inbound" });
  const config = {
    // Telnyx derives a SIP user name from this, so keep it ASCII and starting with letters.
    name: `Ceyo agent ${bot.name.replace(/[^A-Za-z0-9 _-]/g, "").trim() || bot.id.slice(0, 8)}`.slice(0, 120), model: PHONE_MODEL, instructions, greeting,
    voice_settings: { voice: phoneVoice(bot.id, gender) },
    transcription: { model: "deepgram/nova-3", language: "auto" },
    telephony_settings: { time_limit_secs: PHONE_CALL_MAX_SECONDS, user_idle_timeout_secs: 45 },
    tools: [{ type: "hangup", hangup: { description: "Hang up after saying goodbye when the conversation is finished." } }],
    enabled_features: ["telephony"],
  };
  const hash = createHash("sha256").update(JSON.stringify(config)).digest("hex");
  const { data: row } = await db().from("bot_phone_agents").select("telnyx_assistant_id,texml_app_id,config_hash").eq("bot_id", bot.id).maybeSingle();
  if (row && row.config_hash === hash) return { assistantId: row.telnyx_assistant_id, texmlAppId: row.texml_app_id };
  const res = row ? await tx(`/ai/assistants/${row.telnyx_assistant_id}`, { body: config }) : await tx("/ai/assistants", { body: config });
  const data = res.data ?? res;
  const assistantId = String(data.id);
  const texmlAppId = (data.telephony_settings?.default_texml_app_id as string | undefined) || row?.texml_app_id || null;
  const { error } = await db().from("bot_phone_agents").upsert({ bot_id: bot.id, telnyx_assistant_id: assistantId, texml_app_id: texmlAppId, config_hash: hash, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return { assistantId, texmlAppId };
}

/** Mirror numbers bought in Telnyx into the pool so they can be given to agents. */
export async function syncNumberPool() {
  const res = await tx("/phone_numbers?page[size]=100&filter[status]=active");
  for (const n of res.data ?? []) {
    await db().from("phone_numbers").upsert({ e164: n.phone_number, telnyx_number_id: String(n.id) }, { onConflict: "telnyx_number_id", ignoreDuplicates: true });
  }
}

async function loadBot(botId: string, userId: string): Promise<Bot> {
  const { data, error } = await db().from("bots").select("id,owner_id,name,instructions,look").eq("id", botId).eq("owner_id", userId).maybeSingle();
  if (error || !data) throw new Error("Agent not found");
  return data as Bot;
}

/** Give an agent a number from the pool and route incoming calls on it to that agent. */
export async function assignNumber(userId: string, botId: string) {
  const bot = await loadBot(botId, userId);
  const { data: existing } = await db().from("phone_numbers").select("id,e164").eq("bot_id", bot.id).maybeSingle();
  if (existing) return existing as { id: string; e164: string };
  await syncNumberPool();
  const { data: free } = await db().from("phone_numbers").select("id,e164,telnyx_number_id").is("owner_id", null).order("created_at").limit(5);
  for (const n of free ?? []) {
    const { data: claimed } = await db().from("phone_numbers").update({ owner_id: userId, bot_id: bot.id, assigned_at: new Date().toISOString() }).eq("id", n.id).is("owner_id", null).select("id,e164,telnyx_number_id").maybeSingle();
    if (!claimed) continue;
    try {
      const { texmlAppId } = await ensureBotAssistant(bot);
      if (!texmlAppId) throw new Error("Agent phone line could not be created");
      await tx(`/phone_numbers/${claimed.telnyx_number_id}`, { method: "PATCH", body: { connection_id: texmlAppId } });
      return { id: claimed.id as string, e164: claimed.e164 as string };
    } catch (e) {
      await db().from("phone_numbers").update({ owner_id: null, bot_id: null, assigned_at: null }).eq("id", claimed.id);
      throw e;
    }
  }
  throw new Error("No free phone numbers right now");
}

export async function releaseNumber(userId: string, botId: string) {
  const { data: n } = await db().from("phone_numbers").select("id,telnyx_number_id").eq("bot_id", botId).eq("owner_id", userId).maybeSingle();
  if (!n) return;
  await tx(`/phone_numbers/${n.telnyx_number_id}`, { method: "PATCH", body: { connection_id: "" } }).catch(() => undefined);
  const { error } = await db().from("phone_numbers").update({ owner_id: null, bot_id: null, assigned_at: null }).eq("id", n.id).eq("owner_id", userId);
  if (error) throw new Error(error.message);
}

type DialInput = { userId: string; botId: string | null; conversationId: string; to: string; goal: string; callingOwner: boolean; languageHint: string; callId: string };

/** Place one outbound AI call. The phone_calls row is reserved first so retries cannot dial twice. */
export async function dialOut(input: DialInput) {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db().from("phone_calls").select("id", { count: "exact", head: true }).eq("user_id", input.userId).eq("direction", "outbound").gte("created_at", since);
  if ((count ?? 0) >= PHONE_DAILY_CALL_LIMIT) throw new Error(`Daily limit of ${PHONE_DAILY_CALL_LIMIT} phone calls reached`);
  const { count: active } = await db().from("phone_calls").select("id", { count: "exact", head: true }).eq("user_id", input.userId).in("status", ["dialing", "in_progress"]).gte("created_at", new Date(Date.now() - 20 * 60_000).toISOString());
  if ((active ?? 0) > 0) throw new Error("Another phone call is still in progress. Wait for it to finish.");

  let botId = input.botId;
  if (!botId) {
    const { data: profile } = await db().from("profiles").select("primary_bot_id").eq("id", input.userId).maybeSingle();
    botId = profile?.primary_bot_id || null;
  }
  if (!botId) throw new Error("No agent is available to make this call");
  const bot = await loadBot(botId, input.userId);
  input = { ...input, botId };
  const owner = await ownerName(input.userId);
  const arabic = isArabic(input.languageHint);

  await syncNumberPool();
  const { data: own } = input.botId ? await db().from("phone_numbers").select("e164").eq("bot_id", input.botId).maybeSingle() : { data: null };
  const { data: anyNum } = own ? { data: own } : await db().from("phone_numbers").select("e164").order("created_at").limit(1).maybeSingle();
  if (!anyNum?.e164) throw new PhoneUnavailable("No phone number is available to call from");

  const insert = await db().from("phone_calls").insert({
    id: input.callId, user_id: input.userId, bot_id: input.botId, conversation_id: input.conversationId, direction: "outbound",
    counterpart: input.to, agent_number: anyNum.e164, purpose: input.goal, status: "dialing",
  }).select("id").single();
  if (insert.error?.code === "23505") return { id: input.callId, alreadyRequested: true, from: anyNum.e164 };
  if (insert.error) throw new Error(insert.error.message);

  try {
    const [appId, { assistantId }] = await Promise.all([ensureCallControlApp(), ensureBotAssistant(bot)]);
    await widenDestinations().catch(() => undefined);
    const gender = (bot.look?.voiceSettings as { gender?: string } | undefined)?.gender;
    const res = await tx("/calls", { body: {
      connection_id: appId, to: input.to, from: anyNum.e164, from_display_name: bot.name.slice(0, 32),
      timeout_secs: PHONE_RING_TIMEOUT_SECONDS, time_limit_secs: PHONE_CALL_MAX_SECONDS,
      webhook_url: webhookUrl(), client_state: Buffer.from(input.callId).toString("base64"), command_id: input.callId,
      assistant: {
        id: assistantId,
        instructions: phoneInstructions({ botName: bot.name, botInstructions: bot.instructions, ownerName: owner, goal: input.goal, direction: "outbound", counterpart: input.to, callingOwner: input.callingOwner }),
        greeting: phoneGreeting({ botName: bot.name, ownerName: owner, arabic, direction: "outbound", callingOwner: input.callingOwner }),
        voice_settings: { voice: phoneVoice(bot.id, gender) },
      },
    } });
    const ccid = String(res.data.call_control_id);
    await db().from("phone_calls").update({ call_control_id: ccid }).eq("id", input.callId);
    return { id: input.callId, from: anyNum.e164 };
  } catch (e) {
    const message = (e as Error).message;
    await db().from("phone_calls").update({ status: "failed", error: message.slice(0, 500), ended_at: new Date().toISOString() }).eq("id", input.callId);
    if (/D61|upgrade/i.test(message)) throw new PhoneUnavailable("Outgoing phone calls are not enabled yet: the Telnyx account must be upgraded (verified) before agents can dial out. Incoming calls on agent numbers still work.");
    throw e;
  }
}

async function callAlive(ccid: string) {
  try {
    const res = await tx(`/calls/${encodeURIComponent(ccid)}`);
    return Boolean(res.data?.is_alive);
  } catch (e) {
    if ((e as { status?: number }).status === 404 || (e as { status?: number }).status === 422) return false;
    throw e;
  }
}

async function conversationFor(filter: string) {
  const res = await tx(`/ai/conversations?${filter}&limit=1&order=created_at.desc`);
  return (res.data?.[0] as { id: string; metadata?: Record<string, string>; created_at?: string } | undefined) || null;
}

async function conversationTurns(conversationId: string): Promise<Turn[]> {
  const res = await tx(`/ai/conversations/${conversationId}/messages`);
  const rows = (res.data ?? []) as Array<{ role: string; text?: string; content?: string; created_at?: string; sent_at?: string }>;
  rows.sort((a, b) => String(a.created_at || a.sent_at || "").localeCompare(String(b.created_at || b.sent_at || "")));
  return transcriptTurns(rows);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CallRow = any;

async function summarize(row: CallRow, turns: Turn[], botName: string) {
  const arabic = isArabic(`${row.purpose || ""} ${turns.map((t) => t.text).join(" ")}`);
  const status = row.status as string;
  if (!turns.some((t) => t.role === "user")) {
    if (status === "failed") return arabic ? `ما قدرتش أكمّل المكالمة مع ${row.counterpart}. ${row.error ? `السبب: ${row.error}` : ""}`.trim() : `I couldn't complete the call to ${row.counterpart}.${row.error ? ` Reason: ${row.error}` : ""}`;
    return arabic ? `اتصلت بـ ${row.counterpart} ومحدش رد.` : `I called ${row.counterpart} but nobody answered.`;
  }
  try {
    const { generateCerebrasChatCompletion } = await import("@/lib/ceyo/cerebrasCompletion.server");
    const result = await generateCerebrasChatCompletion([
      { role: "system", content: `You are ${botName}. You just finished a real ${row.direction} phone call ${row.direction === "outbound" ? `to ${row.counterpart}` : `from ${row.counterpart}`}${row.purpose ? ` (goal: ${row.purpose})` : ""}. Write ONE short report to your user: the outcome, key facts (names, times, prices, confirmations) and any next step. Be honest: never claim something was agreed if the transcript does not show it. Use the user's language (${arabic ? "Arabic, natural Egyptian if the call was Egyptian" : "the language of the goal"}). Plain text, no headings.` },
      { role: "user", content: JSON.stringify(turns.slice(-80)) },
    ], AbortSignal.timeout(90_000));
    const content = result.choices[0]?.message.content?.trim();
    if (content) return content;
  } catch { /* fall back to the transcript */ }
  const lines = turns.slice(-12).map((t) => `${t.role === "assistant" ? botName : row.counterpart}: ${t.text}`).join("\n");
  return `${arabic ? "ملخص المكالمة" : "Call transcript"}:\n${lines}`;
}

/** Post the call report once: the message ID is the call ID. */
async function deliver(row: CallRow, turns: Turn[]) {
  const { data: bot } = row.bot_id ? await db().from("bots").select("id,name").eq("id", row.bot_id).maybeSingle() : { data: null };
  const botName = (bot?.name as string | undefined) || "Ceyo";
  let conversationId = row.conversation_id as string | null;
  if (!conversationId) {
    const { data: conv } = row.bot_id
      ? await db().from("conversations").select("id").eq("user_id", row.user_id).eq("bot_id", row.bot_id).order("updated_at", { ascending: false }).limit(1).maybeSingle()
      : { data: null };
    conversationId = conv?.id || row.id;
    if (!conv) await db().from("conversations").upsert({ id: row.id, user_id: row.user_id, bot_id: row.bot_id, title: `${botName} · Phone` }, { onConflict: "id", ignoreDuplicates: true });
    await db().from("phone_calls").update({ conversation_id: conversationId }).eq("id", row.id);
  }
  const claim = await db().from("messages").insert({ id: row.id, conversation_id: conversationId, user_id: row.user_id, bot_id: row.bot_id, role: "assistant", content: "", metadata: { phoneCall: { id: row.id, pending: true } } });
  if (claim.error?.code === "23505") return conversationId;
  if (claim.error) throw new Error(claim.error.message);
  const summary = await summarize(row, turns, botName);
  await db().from("messages").update({ content: summary, metadata: { phoneCall: { id: row.id, direction: row.direction, counterpart: row.counterpart, status: row.status } } }).eq("id", row.id);
  await db().from("phone_calls").update({ summary }).eq("id", row.id);
  await db().from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  return conversationId;
}

/** Re-read one outbound call from Telnyx and finish it when the line is closed. */
export async function syncOutbound(row: CallRow): Promise<string | null> {
  if (!row.call_control_id) {
    if (Date.now() - Date.parse(row.created_at) < 2 * 60_000) return null;
    await db().from("phone_calls").update({ status: "failed", error: "The call did not start", ended_at: new Date().toISOString() }).eq("id", row.id).in("status", ["dialing", "in_progress"]);
    return deliver({ ...row, status: "failed", error: "The call did not start" }, []);
  }
  const alive = await callAlive(row.call_control_id);
  const conv = await conversationFor(`metadata->call_control_id=eq.${encodeURIComponent(row.call_control_id)}`).catch(() => null);
  if (alive) {
    if (conv && row.status === "dialing") await db().from("phone_calls").update({ status: "in_progress", telnyx_conversation_id: conv.id }).eq("id", row.id);
    return null;
  }
  const turns = conv ? await conversationTurns(conv.id) : [];
  const status = finalStatus(turns);
  const { data: closed } = await db().from("phone_calls").update({ status, transcript: turns, telnyx_conversation_id: conv?.id ?? null, ended_at: new Date().toISOString() }).eq("id", row.id).in("status", ["dialing", "in_progress"]).select("*").maybeSingle();
  if (!closed) return null;
  return deliver(closed, turns);
}

/** Record finished incoming calls on the user's agent numbers. */
export async function syncInbound(userId?: string): Promise<string[]> {
  let q = db().from("phone_numbers").select("e164,owner_id,bot_id,bot_phone_agents:bot_id(telnyx_assistant_id)").not("bot_id", "is", null);
  if (userId) q = q.eq("owner_id", userId);
  const { data: lines } = await q;
  const delivered: string[] = [];
  for (const line of lines ?? []) {
    const assistantId = line.bot_phone_agents?.telnyx_assistant_id;
    if (!assistantId) continue;
    const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const res = await tx(`/ai/conversations?metadata->assistant_id=eq.${encodeURIComponent(assistantId)}&metadata->telnyx_conversation_channel=eq.phone_call&created_at=gte.${since}&order=created_at.desc&limit=20`).catch(() => ({ data: [] }));
    for (const conv of res.data ?? []) {
      const meta = (conv.metadata || {}) as Record<string, string>;
      if (meta.telnyx_agent_target && meta.telnyx_agent_target !== line.e164) continue;
      const { data: known } = await db().from("phone_calls").select("id").or(`telnyx_conversation_id.eq.${conv.id}${meta.call_control_id ? `,call_control_id.eq.${meta.call_control_id}` : ""}`).limit(1).maybeSingle();
      if (known) continue;
      if (meta.call_control_id && (await callAlive(meta.call_control_id))) continue;
      const turns = await conversationTurns(conv.id);
      const { data: row, error } = await db().from("phone_calls").insert({
        user_id: line.owner_id, bot_id: line.bot_id, direction: "inbound", counterpart: meta.telnyx_end_user_target || "Unknown caller",
        agent_number: line.e164, status: finalStatus(turns), call_control_id: meta.call_control_id || null, telnyx_conversation_id: conv.id,
        transcript: turns, ended_at: new Date().toISOString(),
      }).select("*").single();
      if (error) continue; // a concurrent sync recorded it first
      const c = await deliver(row, turns);
      if (c) delivered.push(c);
    }
  }
  return delivered;
}

/** Sync active outbound calls (one user or everyone) and incoming calls. Returns chats that changed. */
export async function syncPhoneCalls(userId?: string) {
  let q = db().from("phone_calls").select("*").in("status", ["dialing", "in_progress"]).eq("direction", "outbound").limit(20);
  if (userId) q = q.eq("user_id", userId);
  const { data: rows } = await q;
  const changed: string[] = [];
  for (const row of rows ?? []) {
    const c = await syncOutbound(row).catch(() => null);
    if (c) changed.push(c);
  }
  changed.push(...(await syncInbound(userId).catch(() => [])));
  return [...new Set(changed)];
}

/** Webhook trigger: only the call-control id is trusted, everything else is re-read from Telnyx. */
export async function syncByCallControlId(ccid: string) {
  const { data: row } = await db().from("phone_calls").select("*").eq("call_control_id", ccid).maybeSingle();
  if (row && ["dialing", "in_progress"].includes(row.status)) return syncOutbound(row);
  if (!row) await syncInbound().catch(() => []);
  return null;
}
