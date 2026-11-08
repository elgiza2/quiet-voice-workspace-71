import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export const NATIVE_GOOGLE_RETURN = "https://app.ceyo.si/auth/native-return";
export const NATIVE_GOOGLE_CALLBACK = "ceyo://auth/callback";

export function nativeGoogleCode(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "ceyo:" || url.hostname !== "auth" || url.pathname !== "/callback") return null;
    const code = url.searchParams.get("code");
    return code && code.length <= 2048 ? code : null;
  } catch { return null; }
}

let nativeClient: SupabaseClient | undefined;
function authClient() {
  // Publishable configuration only; never embed the Google client secret.
  if (!nativeClient) nativeClient = createClient("https://kcrssdgsefhpzoidlhhm.supabase.co", "sb_publishable_qoVkpETZyG-dHOq_XYnFPw_vrxR_aJC", {
    auth: {
      flowType: "pkce", detectSessionInUrl: false, persistSession: true,
      autoRefreshToken: false, storageKey: "ceyo-native-google", storage: window.localStorage,
    },
  });
  return nativeClient;
}

export async function startNativeGoogle() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return false;
  const { Browser } = await import("@capacitor/browser");
  const { data, error } = await authClient().auth.signInWithOAuth({
    provider: "google", options: { redirectTo: NATIVE_GOOGLE_RETURN, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error("Google sign-in unavailable");
  await Browser.open({ url: data.url });
  return true;
}

/** Only a PKCE code reaches the custom scheme; session tokens never enter a URL. */
export async function listenNativeGoogle(onSuccess: () => void, onError: (error: unknown) => void) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return () => {};
  const { App } = await import("@capacitor/app");
  let exchanging = false;
  let disposed = false;
  const receive = async (url: string) => {
    const code = nativeGoogleCode(url);
    if (!code || exchanging || disposed) return;
    exchanging = true;
    try {
      const { data, error } = await authClient().auth.exchangeCodeForSession(code);
      if (error) throw error;
      if (!data.session) throw new Error("Google sign-in unavailable");
      const restored = await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
      if (restored.error) throw restored.error;
      const verified = await supabase.auth.getUser();
      if (verified.error || !verified.data.user) throw new Error("Google sign-in could not be verified");
      window.localStorage.removeItem("ceyo-native-google");
      if (!disposed) onSuccess();
    } catch (error) { if (!disposed) onError(error); }
    finally { exchanging = false; }
  };
  const listener = await App.addListener("appUrlOpen", ({ url }) => { void receive(url); });
  const launch = await App.getLaunchUrl();
  if (launch?.url) void receive(launch.url);
  return () => { disposed = true; void listener.remove(); };
}