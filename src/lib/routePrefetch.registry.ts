/**
 * Central registry of routes → chunk loaders. Imported once at app startup.
 * Powers hover/focus/touch prefetch via `<PrefetchLink>` and `<NavLink>`.
 *
 * Rules:
 *   - Patterns are matched against `location.pathname` (no query/hash).
 *   - Use RegExp with `^...$` anchors for exact routes, or partial for prefixes.
 *   - The loader MUST be the same `() => import("...")` used by React.lazy in
 *     App.tsx so the browser dedupes on the module cache key.
 *   - Registering a route that isn't in the router is harmless — it just
 *     never matches — but stale entries pointing at deleted files WILL break
 *     the build. Keep this list in sync when adding/removing routes.
 */
import { registerRoute } from "@/lib/routePrefetch";

// -- Top-level app routes --------------------------------------------------
registerRoute(/^\/auth(\/|$)/, () => import("@/pages/auth/AuthPage"));
registerRoute(/^\/chat(\/|$)/, () => import("@/pages/agent/AgentHubPage"));
registerRoute(/^\/(index)?$/, () => import("@/pages/agent/AgentHubPage"));
registerRoute(/^\/wallet(\/|$)/, () => import("@/pages/wallet/WalletPage"));

// -- Settings --------------------------------------------------------------
registerRoute(/^\/settings\/apps(\/|$)/, () => import("@/pages/ceyo/CeyoAppsSettings"));
registerRoute(/^\/settings(?!\/apps)(\/|$)/, () => import("@/pages/ceyo/CeyoSettings"));
// Warm only actual next-hop destinations through nextHop.ts, never all screens at boot.
export {};
