import { useEffect, useSyncExternalStore } from "react";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";

/**
 * The device's own Spotify connection — Authorization Code with **PKCE**.
 *
 * Why this exists at all. Supabase puts `provider_token` / `provider_refresh_token`
 * in the session only in the moment after the OAuth exchange and drops both on
 * its own session refresh; it never persists or renews them, and GoTrue exposes
 * no endpoint that would. So reading `session.provider_token` — which is what
 * lib/spotify.ts used to do — goes null about an hour after login, and every
 * Spotify-backed feature died with it until the user signed out and back in.
 *
 * Refreshing Supabase's token for it is not an option: that token came from the
 * confidential authorization-code flow, so renewing it needs the client secret,
 * which cannot ship in an app. PKCE is the way out — Spotify documents it as
 * the flow for "any other type of application where the client secret can't be
 * safely stored", and its refresh request takes only `grant_type`,
 * `refresh_token` and `client_id`. No secret, no server.
 *
 * So the app runs **two** authorizations, and they do different jobs:
 *   Supabase OAuth → identity, the JWT, RLS. Unchanged.
 *   this PKCE flow → a Spotify refresh token we own, kept in SecureStore.
 * The second one normally costs no extra tap: the user has just granted these
 * exact scopes to this exact client_id, so Spotify redirects straight through
 * its consent screen.
 *
 * `getSpotifyToken()` is now the only way to get a user token on the device.
 */

const CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID;
const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

/** SecureStore key for the long-lived refresh token. */
const REFRESH_KEY = "spotify.refresh_token";

/**
 * Scopes, shared with the Supabase sign-in so the two authorizations can't
 * drift apart and leave one of them short of a permission.
 */
export const SPOTIFY_SCOPES =
  "user-read-email user-read-private user-top-read user-read-recently-played user-read-currently-playing user-read-playback-state";

/** Renew this long before the hour is up, so a call never races the expiry. */
const EXPIRY_MARGIN_MS = 60_000;

// ── Connection state, for the "Reconnect Spotify" affordance ────────────────

/** null = not read from SecureStore yet. */
let connected: boolean | null = null;
/** Increments each time a connection is successfully (re)established. */
let epoch = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function setConnected(value: boolean) {
  if (connected === value) return;
  connected = value;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * `true` connected, `false` needs reconnecting, `null` not known yet. Goes
 * `false` only when Spotify actively rejects our refresh token (revoked in the
 * user's Spotify account, or the app's authorization withdrawn) — not on an
 * offline blip, which would nag people for something they can't fix.
 */
export function useSpotifyConnection(): boolean | null {
  useEffect(() => {
    void loadRefreshToken();
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => connected,
    () => connected,
  );
}

/**
 * A number that changes whenever the Spotify connection is (re)established.
 *
 * Screens that fetch Spotify data once on mount must put this in their fetch
 * deps. Without it, a fetch that ran while there was no working token caches
 * its empty result for the lifetime of the mount, and reconnecting doesn't
 * bring the data back — the only cure is a full remount, i.e. signing out and
 * in, which is exactly the bug the PKCE flow was supposed to end.
 *
 * It deliberately does NOT change on every connection *check*, only on a
 * successful connect, so a normal launch still fetches once rather than twice.
 */
export function useSpotifyEpoch(): number {
  return useSyncExternalStore(
    subscribe,
    () => epoch,
    () => epoch,
  );
}

// ── Token storage ───────────────────────────────────────────────────────────

/** undefined = not read yet; null = definitely absent. */
let refreshToken: string | null | undefined;
/** Access tokens are short-lived, so they live in memory only. */
let access: { value: string; expiresAt: number } | null = null;
/** Concurrent callers share one refresh — racing token calls trigger 429s. */
let inflight: Promise<string | null> | null = null;
/** Set from a 429's Retry-After; we stay off Spotify until then. */
let cooldownUntil = 0;
/**
 * Bumped on disconnect. A refresh already in flight when someone signs out
 * would otherwise land afterwards and write its rotated token back, quietly
 * reconnecting the *next* user to the previous one's Spotify account.
 */
let generation = 0;

async function loadRefreshToken(): Promise<string | null> {
  if (refreshToken !== undefined) return refreshToken;
  try {
    refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  } catch {
    refreshToken = null;
  }
  setConnected(!!refreshToken);
  return refreshToken;
}

async function storeRefreshToken(token: string | null) {
  refreshToken = token;
  try {
    if (token) await SecureStore.setItemAsync(REFRESH_KEY, token);
    else await SecureStore.deleteItemAsync(REFRESH_KEY);
  } catch {
    /* a keychain write failing shouldn't take the session down with it */
  }
  setConnected(!!token);
}

// ── PKCE primitives ─────────────────────────────────────────────────────────

/** Unreserved characters, per RFC 7636 — a verifier must be 43-128 of these. */
const VERIFIER_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

function randomString(length: number): string {
  const bytes = Crypto.getRandomBytes(length);
  let out = "";
  for (const b of bytes) out += VERIFIER_CHARS[b % VERIFIER_CHARS.length];
  return out;
}

function base64url(value: string): string {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return base64url(digest);
}

// ── Connecting ──────────────────────────────────────────────────────────────

/**
 * Run the PKCE authorization and store the resulting refresh token. Returns
 * false if the user backed out or Spotify refused; never throws for those.
 *
 * The redirect goes through the same https bridge as the Supabase sign-in, and
 * for the same reason: Supabase and Spotify both reject `exp://` redirect
 * targets. Spotify is stricter still — it matches `redirect_uri` against the
 * registered URI **exactly**, so unlike the Supabase flow we can't hang the
 * app's deep link off it as `?app=`. It rides in `state` instead, after the
 * CSRF nonce (`<nonce>|<deep link>`), which the bridge knows how to unpack.
 */
export async function connectSpotify(): Promise<boolean> {
  if (!CLIENT_ID) throw new Error("EXPO_PUBLIC_SPOTIFY_CLIENT_ID is not set");
  const bridgeBase = process.env.EXPO_PUBLIC_AUTH_BRIDGE;
  if (!bridgeBase) throw new Error("EXPO_PUBLIC_AUTH_BRIDGE is not set");

  // Must match the URI registered in the Spotify dashboard, character for
  // character — no query string of our own.
  const redirectUri = `${bridgeBase}/native-auth.html`;
  const appReturn = makeRedirectUri({ path: "auth/callback" });

  const verifier = randomString(64);
  const nonce = randomString(16);
  const state = `${nonce}|${appReturn}`;

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    code_challenge_method: "S256",
    code_challenge: await codeChallenge(verifier),
    state,
  });

  const result = await WebBrowser.openAuthSessionAsync(`${AUTHORIZE_URL}?${params}`, appReturn);
  if (result.type !== "success") return false; // cancelled or dismissed

  const returned = new URL(result.url).searchParams;
  const code = returned.get("code");
  // The nonce is the half of `state` that Spotify echoed back untouched; the
  // bridge only ever reads the deep link after it.
  if (!code || (returned.get("state") ?? "").split("|")[0] !== nonce) return false;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }).toString(),
  });
  if (!res.ok) {
    console.warn("[spotify-auth] code exchange failed", res.status, await res.text());
    return false;
  }

  const data = await res.json();
  if (!data.refresh_token) return false;

  await storeRefreshToken(data.refresh_token);
  if (data.access_token) {
    access = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  }

  // Tell the screens their cached "no data" answers are stale now. storeRefreshToken
  // already notified if `connected` flipped, but re-authorising an already-connected
  // account doesn't flip it, so this has to fire on its own.
  epoch++;
  notify();
  return true;
}

/** Forget the connection. Called on sign-out so the next user starts clean. */
export async function disconnectSpotify(): Promise<void> {
  generation++;
  access = null;
  inflight = null;
  await storeRefreshToken(null);
}

// ── Using it ────────────────────────────────────────────────────────────────

async function refreshAccessToken(token: string): Promise<string | null> {
  const gen = generation;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    // No Authorization header: under PKCE the client_id in the body *is* the
    // client authentication. This is the whole reason the device can do this.
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token,
      client_id: CLIENT_ID!,
    }).toString(),
  });

  if (res.status === 429) {
    // Shared client_id: a 429 here can break OAuth login too, so back off
    // rather than retrying. Same rule as the web app's global cool-down.
    const retryAfter = Number(res.headers.get("retry-after") ?? 30);
    cooldownUntil = Date.now() + (Number.isFinite(retryAfter) ? retryAfter : 30) * 1000;
    return null;
  }

  if (!res.ok) {
    const body = await res.text();
    // invalid_grant is the one failure that means the token is dead for good
    // (revoked in the user's Spotify account). Anything else — offline, 5xx —
    // is transient, and throwing the connection away for it would be wrong.
    if (res.status === 400 && body.includes("invalid_grant") && gen === generation) {
      console.warn("[spotify-auth] refresh token rejected; reconnect needed");
      access = null;
      await storeRefreshToken(null);
    }
    return null;
  }

  const data = await res.json();
  if (!data.access_token) return null;
  // Signed out (or reconnected) while this was in flight — these tokens belong
  // to a connection that no longer exists, so drop them on the floor.
  if (gen !== generation) return null;

  // Spotify may hand back a rotated refresh token; if it does, the old one
  // stops working, so persist the new one before anything else can fail.
  if (data.refresh_token && data.refresh_token !== token) {
    await storeRefreshToken(data.refresh_token);
  }

  access = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return access.value;
}

/**
 * A usable Spotify user token, or null if we can't get one right now.
 *
 * This is what makes the session survive: callers no longer hold a token that
 * ages out, they ask for one per call and get a live one. Callers should still
 * degrade gracefully on null — the user may be offline, cooling down from a
 * 429, or genuinely disconnected.
 */
export async function getSpotifyToken(): Promise<string | null> {
  if (access && access.expiresAt > Date.now() + EXPIRY_MARGIN_MS) return access.value;
  if (Date.now() < cooldownUntil) return null;
  if (!CLIENT_ID) return null;

  const token = await loadRefreshToken();
  if (!token) return null;

  if (inflight) return inflight;
  inflight = refreshAccessToken(token).finally(() => {
    inflight = null;
  });
  return inflight;
}
