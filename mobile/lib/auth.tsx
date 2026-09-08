import { createContext, use, useEffect, useState, type ReactNode } from "react";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import type { Session } from "@supabase/supabase-js";
import { connectSpotify, disconnectSpotify, SPOTIFY_SCOPES } from "@/lib/spotify-auth";
import { supabase } from "@/lib/supabase";

// Finishes any pending auth session when the app is reopened from the browser.
WebBrowser.maybeCompleteAuthSession();

// Scopes live in lib/spotify-auth.ts, because the Spotify PKCE authorization
// below has to ask for exactly the same set. Same scopes the web app requests,
// plus user-read-private for the country (Listening Map) detection.
const SCOPES = SPOTIFY_SCOPES;

type AuthValue = {
  session: Session | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-run just the Spotify half — for the "Reconnect Spotify" affordance. */
  reconnectSpotify: () => Promise<boolean>;
};

const AuthContext = createContext<AuthValue>({
  session: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  reconnectSpotify: async () => false,
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
    // through a public https bridge: auth-bridge/native-auth.html, served from
    // the repo's gh-pages branch. Its origin is injected via
    // EXPO_PUBLIC_AUTH_BRIDGE at dev-server start, and the page forwards the
    // OAuth code on to `appReturn`. Editing that file changes nothing until
    // it's pushed to gh-pages — the phone loads the published copy, not this
    // repo's. The Spotify PKCE flow in lib/spotify-auth.ts uses it too.
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

    // Then take out our own Spotify authorization. Supabase's tokens are gone
    // an hour later and can't be renewed without the client secret; this one we
    // can refresh forever (see lib/spotify-auth.ts). The user has just granted
    // these scopes to this client_id, so Spotify normally redirects straight
    // back without showing its consent screen a second time.
    //
    // Deliberately not fatal: failing here leaves a perfectly good signed-in
    // session that can still read Supabase, and the profile screen offers a
    // Reconnect row. Throwing would strand the user on the login screen.
    try {
      await connectSpotify();
    } catch (e) {
      console.warn("[auth] Spotify connection failed", e);
    }
  }

  async function signOut() {
    // Drop the Spotify refresh token too — it outlives the Supabase session in
    // SecureStore, and the next person to sign in on this device must not
    // inherit the last one's Spotify account.
    await disconnectSpotify();
    await supabase.auth.signOut();
  }

  return (
    <AuthContext value={{ session, loading, signIn, signOut, reconnectSpotify: connectSpotify }}>
      {children}
    </AuthContext>
  );
}

export function useSession() {
  return use(AuthContext);
}
