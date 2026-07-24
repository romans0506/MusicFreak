import { createContext, use, useEffect, useState, type ReactNode } from "react";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// Finishes any pending auth session when the app is reopened from the browser.
WebBrowser.maybeCompleteAuthSession();

// Same scopes the web app requests, plus user-read-private for the country
// (Listening Map) detection.
const SCOPES =
  "user-read-email user-read-private user-top-read user-read-recently-played user-read-currently-playing user-read-playback-state";

type AuthValue = {
  session: Session | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  session: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn() {
    // The Expo Go deep link the app's auth session listens for.
    const appReturn = makeRedirectUri({ path: "auth/callback" });
    // Supabase rejects exp:// schemes AND raw-IP redirect hosts, so we route
    // through a public https bridge (a Cloudflare tunnel → the local bridge
    // page in auth-bridge/). Its base URL is injected via EXPO_PUBLIC_AUTH_BRIDGE
    // at dev-server start. The bridge forwards the OAuth code on to `appReturn`.
    const bridgeBase = process.env.EXPO_PUBLIC_AUTH_BRIDGE;
    if (!bridgeBase) throw new Error("EXPO_PUBLIC_AUTH_BRIDGE is not set");
    const redirectTo = `${bridgeBase}/native-auth.html?app=${encodeURIComponent(appReturn)}`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "spotify",
      options: { redirectTo, skipBrowserRedirect: true, scopes: SCOPES },
    });
    if (error) throw error;
    if (!data?.url) throw new Error("No OAuth URL returned");

    const result = await WebBrowser.openAuthSessionAsync(data.url, appReturn);
    if (result.type !== "success") return; // user cancelled / dismissed

    // Supabase redirects back with ?code=... (PKCE) — exchange it for a session.
    const code = new URL(result.url).searchParams.get("code");
    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext value={{ session, loading, signIn, signOut }}>{children}</AuthContext>
  );
}

export function useSession() {
  return use(AuthContext);
}
