// Cached Spotify Client-Credentials app token.
// Module-level cache so we DON'T request a new token on every API call —
// requesting a fresh token per request floods Spotify and triggers 429s
// (which also breaks OAuth login, since it shares the same client_id).

let cachedToken: { value: string; expiresAt: number } | null = null

// When Spotify returns 429, back off entirely until this timestamp.
// Hammering during a rate-limit window only makes it worse (and can break login).
let rateLimitedUntil = 0

/** Seconds left in the current Spotify cool-down, or 0 if not rate-limited. */
export function spotifyCooldown(): number {
  const now = Date.now()
  return rateLimitedUntil > now ? Math.ceil((rateLimitedUntil - now) / 1000) : 0
}

/** Record a 429 from Spotify; respects the Retry-After header if present. */
export function noteSpotify429(retryAfterHeader?: string | null) {
  const secs = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN
  const waitMs = (Number.isFinite(secs) ? secs : 30) * 1000
  rateLimitedUntil = Date.now() + waitMs
  console.warn(`[spotify] 429 received — backing off for ${waitMs / 1000}s`)
}

// Refreshed user access tokens, keyed by the user's provider_refresh_token.
// Spotify's provider_token (in the Supabase session) expires after ~1h and is
// dropped on session refresh, so we mint a fresh one from the refresh token.
const userTokenCache = new Map<string, { value: string; expiresAt: number }>()

// In-flight refreshes, keyed by refresh token. The profile page fires several
// API calls at once; without this they'd each POST to /api/token in parallel,
// and racing token requests are a fast path to a 429 on accounts.spotify.com.
const inflightRefresh = new Map<string, Promise<string | null>>()

/**
 * Exchange a Spotify provider_refresh_token for a fresh user access token.
 * Cached until expiry (60s safety margin). Concurrent callers share one
 * request. Respects the global cool-down.
 */
export async function refreshSpotifyUserToken(refreshToken: string): Promise<string | null> {
  const cached = userTokenCache.get(refreshToken)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value

  const existing = inflightRefresh.get(refreshToken)
  if (existing) return existing

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  if (spotifyCooldown() > 0) return null

  const request = (async (): Promise<string | null> => {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
      cache: "no-store",
    })

    if (res.status === 429) {
      noteSpotify429(res.headers.get("retry-after"))
      return null
    }
    if (!res.ok) {
      console.error("[spotify] refresh_token failed", res.status, await res.text())
      return null
    }

    const data = await res.json()
    if (!data.access_token) return null

    userTokenCache.set(refreshToken, {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    })
    return data.access_token
  })()

  inflightRefresh.set(refreshToken, request)
  try {
    return await request
  } finally {
    inflightRefresh.delete(refreshToken)
  }
}

/**
 * Resolve a usable Spotify *user* access token from a Supabase session.
 * Prefers the session's provider_token; when that's missing/expired, mints a
 * fresh one from provider_refresh_token. Returns null if neither is available
 * (caller should treat as "needs re-auth").
 */
export async function resolveSpotifyUserToken(session: {
  provider_token?: string | null
  provider_refresh_token?: string | null
} | null): Promise<string | null> {
  if (!session) return null
  if (session.provider_refresh_token) {
    const refreshed = await refreshSpotifyUserToken(session.provider_refresh_token)
    if (refreshed) return refreshed
  }
  return session.provider_token ?? null
}

/**
 * Wrapper for Spotify calls made with the *user* token.
 * Feeds the same global cool-down the app-token path uses: a 429 on any
 * call sharing our client_id (user OR app token) can break OAuth login,
 * so every 429 must trip the cool-down — not just the app-token ones.
 *
 * Returns null while cooling down (caller should degrade gracefully).
 */
export async function spotifyUserFetch(
  url: string,
  init: RequestInit
): Promise<Response | null> {
  if (spotifyCooldown() > 0) return null
  const res = await fetch(url, init)
  if (res.status === 429) {
    noteSpotify429(res.headers.get("retry-after"))
  }
  return res
}

// In-flight app-token request, shared by concurrent callers (same reason as
// inflightRefresh above — avoid racing token requests that trigger a 429).
let inflightAppToken: Promise<string | null> | null = null

export async function getSpotifyAppToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  // Don't even try while cooling down from a 429.
  if (spotifyCooldown() > 0) return null

  // Reuse cached token while valid (60s safety margin before expiry)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }

  if (inflightAppToken) return inflightAppToken

  const request = (async (): Promise<string | null> => {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    })

    if (res.status === 429) {
      noteSpotify429(res.headers.get("retry-after"))
      return null
    }

    if (!res.ok) {
      console.error("[spotify] client_credentials failed", res.status, await res.text())
      return null
    }

    const data = await res.json()
    if (!data.access_token) return null

    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    }
    return cachedToken.value
  })()

  inflightAppToken = request
  try {
    return await request
  } finally {
    inflightAppToken = null
  }
}

/**
 * Fetch artist name + image by id via the app token (catalog).
 * Uses the single-artist endpoint `/v1/artists/{id}` per id — the batch
 * `/v1/artists?ids=` endpoint returns 403 for this app (Spotify restriction),
 * while the single one works. Returns a Map keyed by artist id; empty on
 * cool-down / failure.
 */
export async function fetchSpotifyArtists(
  ids: string[]
): Promise<Map<string, { name: string; image: string | null }>> {
  const out = new Map<string, { name: string; image: string | null }>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return out

  const token = await getSpotifyAppToken()
  if (!token) return out

  const headers = { Authorization: `Bearer ${token}` }
  await Promise.all(
    unique.map(async (id) => {
      const res = await fetch(`https://api.spotify.com/v1/artists/${id}`, { headers, cache: "no-store" })
      if (res.status === 429) {
        noteSpotify429(res.headers.get("retry-after"))
        return
      }
      if (!res.ok) return
      const a = await res.json()
      if (a?.id) out.set(a.id, { name: a.name, image: a.images?.[0]?.url ?? null })
    })
  )
  return out
}
