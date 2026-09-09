import { createContext, use, useEffect, useState, type ReactNode } from "react";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import type { Session } from "@supabase/supabase-js";
import { clearFavorites } from "@/lib/favorites";
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

/**
 * A second Spotify account failing while the first works is almost always the
 * development-mode allowlist, and Spotify's own wording never says so.
 *
 * Per Spotify's quota-modes docs, a development-mode app allows **5** users,
 * each added individually under Settings → User Management. A non-allowlisted
 * account can complete the login flow, but every API call with its token gets a
 * 403 — including the /v1/me profile fetch Supabase makes while creating the
 * user. That fetch failing is what aborts the callback, so the app is handed an
 * error instead of a code and drops back to the landing screen.
 */
function spotifyErrorMessage(raw: string): string {
  if (/not registered|development mode|access_denied|unauthorized|server_error|forbidden|403|exchange/i.test(raw)) {
    return `${raw}

This Spotify app is in development mode, which allows only 5 accounts. Add this account under Settings → User Management in the Spotify dashboard, then try again.`;
  }
  return raw;
}

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
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        scopes: SCOPES,
        // show_dialog forces Spotify's approval screen instead of bouncing
        // straight back. The in-app browser shares cookies with Safari/Chrome,
        // so a returning user was silently re-authorized as whoever was already
        // signed in to Spotify — with no way to reach a different account.
        queryParams: { show_dialog: "true" },
      },
    });
    if (error) throw error;
    if (!data?.url) throw new Error("No OAuth URL returned");

    const result = await WebBrowser.openAuthSessionAsync(data.url, appReturn);
    if (result.type !== "success") return; // user cancelled / dismissed

    // Supabase redirects back with ?code=... (PKCE) — or with ?error=... when
    // Spotify refused. Both arrive here through the bridge, which forwards every
    // param. Swallowing the error branch is what made a failed sign-in look like
    // nothing happening: no session, no message, straight back to the landing
    // screen. The most common cause is the Spotify app being in development
    // mode, where only accounts added under Users and Access may authorize.
    const returned = new URL(result.url).searchParams;
    const oauthError = returned.get("error_description") ?? returned.get("error");
    if (oauthError) {
      throw new Error(spotifyErrorMessage(oauthError.replace(/\+/g, " ")));
    }

    const code = returned.get("code");
    if (!code) {
      throw new Error("Spotify did not return an authorization code. Please try again.");
    }

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;

    // Let the first auth session finish dismissing. iOS allows only one
    // ASWebAuthenticationSession at a time and expo-web-browser rejects an
    // overlapping open, so starting the next one in the same tick can fail.
    await new Promise((resolve) => setTimeout(resolve, 500));

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
    clearFavorites();
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
