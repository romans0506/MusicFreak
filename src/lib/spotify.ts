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
}
