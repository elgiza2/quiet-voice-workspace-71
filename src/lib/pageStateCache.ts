/** Only UI selections/scroll positions, never HTML, API payloads or credentials. */
export const PAGE_STATE_PREFIX = "ceyo:page-state:v1:";
const MAX_AGE = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 32;
const PATHS = new Set(["/", "/index", "/settings", "/settings/apps", "/settings/plans", "/settings/appearance", "/settings/language", "/settings/usage", "/settings/storage", "/settings/devices", "/settings/computer", "/settings/phone", "/settings/memory", "/settings/permissions", "/settings/subscription"]);
export type PageState = { scrollTop?: number; tab?: number; category?: string };
function valid(value: unknown): value is PageState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).every(k => ["scrollTop", "tab", "category"].includes(k)) &&
    (v.scrollTop === undefined || (typeof v.scrollTop === "number" && Number.isFinite(v.scrollTop) && v.scrollTop >= 0 && v.scrollTop <= 1_000_000)) &&
    (v.tab === undefined || (typeof v.tab === "number" && Number.isInteger(v.tab) && v.tab >= 0 && v.tab <= 2)) &&
    (v.category === undefined || (typeof v.category === "string" && v.category.length <= 64));
}
function key(owner: string, path: string) { return PAGE_STATE_PREFIX + encodeURIComponent(owner) + ":" + path; }
function storageKeys() { return Object.keys(localStorage).filter(k => k.startsWith(PAGE_STATE_PREFIX)); }
/** Run on every identity transition, including a first session on a shared device. */
export function syncPageStateOwner(previous: string | null, next: string | null) {
  if (!next || (previous && previous !== next)) { clearPageStates(); return; }
  if (previous === next) return;
  try { const own = PAGE_STATE_PREFIX + encodeURIComponent(next) + ":"; storageKeys().filter(k => !k.startsWith(own)).forEach(k => localStorage.removeItem(k)); } catch {}
}
export function clearPageStates() { try { storageKeys().forEach(k => localStorage.removeItem(k)); } catch { /* Storage may be disabled. */ } }
export function readPageState(owner: string | null, path: string): PageState | null {
  if (!owner || !PATHS.has(path)) return null;
  try {
    const k = key(owner, path), raw = localStorage.getItem(k);
    if (!raw) return null;
    const e = JSON.parse(raw);
    if (raw.length > 2048 || e.version !== 1 || e.owner !== owner || !Number.isFinite(e.at) || e.at > Date.now() || Date.now() - e.at >= MAX_AGE || !valid(e.value)) {
      localStorage.removeItem(k); return null;
    }
    return e.value;
  } catch { try { localStorage.removeItem(key(owner, path)); } catch {} return null; }
}
export function writePageState(owner: string | null, path: string, value: PageState) {
  if (!owner || !PATHS.has(path) || !valid(value)) return;
  try {
    const k = key(owner, path);
    // Insertion order gives bounded eviction without maintaining a second index.
    localStorage.removeItem(k);
    localStorage.setItem(k, JSON.stringify({ version: 1, owner, at: Date.now(), value }));
    const keys = storageKeys();
    keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES)).forEach(old => localStorage.removeItem(old));
  } catch { /* Cache is optional, never a prerequisite for navigation. */ }
}