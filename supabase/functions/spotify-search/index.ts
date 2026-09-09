// Supabase Edge Function (Deno) — Spotify catalog artist search.
//
// Why this exists: /v1/search needs the APP token (client-credentials), which
// needs the client secret, which can never ship in an Expo bundle. Without this
// the phone can only ever reach artists already in the user's own top-artists
// list — you could not open an artist you had never played.
//
// This is NOT the user-token problem that PKCE solves. An app token belongs to
// the application, not to a session: mint it from client_id + secret, use it for
// an hour, mint another. There is no refresh token to lose and no consent screen.
// Port of getSpotifyAppToken() in src/lib/spotify.ts — keep them in sync. One
// deliberate difference: Deno has no Buffer, so the Basic header uses btoa().
//
// THE HAZARD IS 429, NOT EXPIRY. A 429 on this client_id also breaks OAuth
// login, because Supabase's profile fetch shares the id. Hence: the token is
// cached and never minted per request, concurrent mints share one promise,
// a 429 sets a global cool-down, and responses are cached per query.
//
// DEPLOY:
//   1. supabase functions deploy spotify-search   (or paste in the Dashboard)
//   2. Edge Functions → Secrets → SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.
//      Same values as the web .env.local. NOTE: the secret now lives in three
//      places — .env.local, Auth → Providers → Spotify, and here. Rotating it
//      means updating all three, or login breaks.
//   3. Leave "Verify JWT" ON.

type SpotifyArtist = { id: string; name: string; image: string | null };

const SEARCH_TTL_MS = 10 * 60_000;
const SEARCH_MISS_TTL_MS = 60_000;

// Module scope survives between invocations while the instance is warm.
let cachedToken: { value: string; expiresAt: number } | null = null;
let inflightToken: Promise<string | null> | null = null;
let rateLimitedUntil = 0;
const searchCache = new Map<string, { artists: SpotifyArtist[]; expiresAt: number }>();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function cooldown(): number {
  const now = Date.now();
  return rateLimitedUntil > now ? Math.ceil((rateLimitedUntil - now) / 1000) : 0;
}

function note429(retryAfterHeader: string | null) {
  const secs = parseInt(retryAfterHeader ?? "", 10);
  rateLimitedUntil = Date.now() + (Number.isFinite(secs) ? secs : 30) * 1000;
  console.warn("[spotify] 429 — backing off");
}

/** Cached client-credentials token. Never mint per request. */
async function appToken(): Promise<string | null> {
  const id = Deno.env.get("SPOTIFY_CLIENT_ID");
  const secret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!id || !secret) return null;
  if (cooldown() > 0) return null;

  // 60s safety margin, so a token can't expire mid-request.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  if (inflightToken) return inflightToken;

  inflightToken = (async (): Promise<string | null> => {
    try {
      const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
        },
        body: "grant_type=client_credentials",
      });
      if (res.status === 429) {
        note429(res.headers.get("retry-after"));
        return null;
      }
      if (!res.ok) {
        console.error("[spotify] client_credentials failed", res.status, await res.text());
        return null;
      }
      const data = await res.json();
      if (!data.access_token) return null;
      cachedToken = {
        value: data.access_token,
        expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      };
      return cachedToken.value;
    } catch (err) {
      console.error("[spotify] token request failed", err);
      return null;
    } finally {
      inflightToken = null;
    }
  })();

  return inflightToken;
}

async function searchArtists(query: string): Promise<{ artists: SpotifyArtist[]; ok: boolean }> {
  const key = query.trim().toLowerCase();
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { artists: cached.artists, ok: true };

  const token = await appToken();
  if (!token) return { artists: cached?.artists ?? [], ok: false };

  // limit is capped at 10: a development-mode app gets "Invalid limit" above
  // that. Those results also omit followers/popularity — the artist screen's
  // own GET /v1/artists/{id} fills them in, so it doesn't matter here.
  const params = new URLSearchParams({ q: query, type: "artist", limit: "10" });
  try {
    const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 429) {
      note429(res.headers.get("retry-after"));
      return { artists: cached?.artists ?? [], ok: false };
    }
    if (!res.ok) {
      console.error("[spotify] search failed", res.status, await res.text());
      return { artists: cached?.artists ?? [], ok: false };
    }

    const data = await res.json();
    const artists: SpotifyArtist[] = (data.artists?.items ?? [])
      .filter((a: { id?: string; name?: string }) => a?.id && a?.name)
      .map((a: { id: string; name: string; images?: { url?: string }[] }) => ({
        id: a.id,
        name: a.name,
        image: a.images?.[0]?.url ?? null,
      }));

    searchCache.set(key, {
      artists,
      expiresAt: Date.now() + (artists.length ? SEARCH_TTL_MS : SEARCH_MISS_TTL_MS),
    });
    return { artists, ok: true };
  } catch (err) {
    console.error("[spotify] search request failed", err);
    return { artists: cached?.artists ?? [], ok: false };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let q = "";
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    q = String(body?.q ?? "");
  } else {
    q = new URL(req.url).searchParams.get("q") ?? "";
  }
  q = q.trim().slice(0, 100);

  if (q.length < 2) return json({ artists: [] });
  if (!Deno.env.get("SPOTIFY_CLIENT_ID") || !Deno.env.get("SPOTIFY_CLIENT_SECRET")) {
    return json({ artists: [], configured: false });
  }
  // Tell the client we're cooling down rather than letting it read an empty
  // result as "no such artist".
  if (cooldown() > 0) return json({ artists: [], rateLimited: true });

  const { artists, ok } = await searchArtists(q);
  return json({ artists, configured: true, ok });
});
