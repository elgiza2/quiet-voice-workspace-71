/** Which Ceyo surface this host serves. Browser-safe.
 *  ceyo.si = landing (public pages only), web.ceyo.si = web app (Kashier),
 *  app.ceyo.si = Android app shell (Google Play). Other hosts (preview, localhost) act as the web app. */
export type Surface = "landing" | "web" | "android";

export const DOMAINS = { landing: "ceyo.si", web: "web.ceyo.si", android: "app.ceyo.si" } as const;

const PUBLIC_PATHS = /^\/(terms|privacy|subscription-terms|about|contact|cookies|security|docs)(\/|$)/;

export function surfaceFor(host: string): Surface {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (h === DOMAINS.landing) return "landing";
  if (h === DOMAINS.android) return "android";
  return "web";
}

/** On the landing domain only public pages stay; app paths move to the web app with the same path. */
export function landingRedirect(host: string, path: string, search = ""): string | null {
  if (surfaceFor(host) !== "landing") return null;
  if (PUBLIC_PATHS.test(path)) return null;
  return `https://${DOMAINS.web}${path}${search}`;
}
