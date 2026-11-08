import type { NavigateFunction } from "react-router-dom";
import { safeInternalPath } from "@/lib/security/safeRedirect";

/**
 * Keep post-auth navigation inside the SPA. Full-page assignments are especially
 * disruptive in Android/TWA and installed-PWA contexts because they can reopen
 * the browser instead of returning to the app shell.
 */
export function getPostAuthPath(
  redirect: string | null | undefined,
  currentSearch = typeof window !== "undefined" ? window.location.search : "",
): string {
  const path = safeInternalPath(redirect) ?? "/chat";
  const source = new URLSearchParams(currentSearch).get("source");
  if (source !== "pwa" || path.includes("source=")) return path;

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}source=pwa`;
}

export function navigateAfterAuth(
  navigate: NavigateFunction,
  redirect: string | null | undefined,
  currentSearch?: string,
) {
  navigate(getPostAuthPath(redirect, currentSearch), { replace: true });
}

export function absoluteAuthRedirect(
  redirect: string | null | undefined,
  currentSearch?: string,
): string {
  const destination = getPostAuthPath(redirect, currentSearch);
  // OAuth lands publicly; the destination is only followed after session verification.
  const params = new URLSearchParams({ oauth: "1", redirect: destination });
  const path = `/auth?${params}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}
