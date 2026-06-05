import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, callerKey } from "@/lib/rate-limit"
import { spotifyUserFetch, spotifyCooldown, resolveSpotifyUserToken } from "@/lib/spotify"

// Per-user in-memory cache: userId → { data, expiresAt }
const recentCache = new Map<string, { data: unknown; expiresAt: number }>()
const RECENT_TTL = 60_000 // 60s — recently-played changes slowly

export async function GET(req: Request) {
  const limit = rateLimit(`recently-played:${callerKey(req)}`, 10, 30_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { items: [], rateLimited: true },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    )
  }

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ items: [] }, { status: 401 })

  const userId = session.user.id
  const cached = recentCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data)
  }

  // Spotify told us to back off — serve nothing rather than pile on.
  if (spotifyCooldown() > 0) return NextResponse.json({ items: [], rateLimited: true })

  const token = await resolveSpotifyUserToken(session)
  if (!token) return NextResponse.json({ items: [] }, { status: 401 })

  const res = await spotifyUserFetch(
    "https://api.spotify.com/v1/me/player/recently-played?limit=50",
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  )

  if (!res?.ok) return NextResponse.json({ items: [] })

  const data = await res.json()

  const items = (data.items ?? []).map((entry: any) => ({
    playedAt: entry.played_at,
    id: entry.track?.id,
    name: entry.track?.name,
    artists: entry.track?.artists?.map((a: any) => a.name).join(", "),
    albumArt: entry.track?.album?.images?.[2]?.url ?? entry.track?.album?.images?.[0]?.url ?? null,
    url: entry.track?.external_urls?.spotify ?? null,
  }))

  const result = { items }
  recentCache.set(userId, { data: result, expiresAt: Date.now() + RECENT_TTL })
  return NextResponse.json(result)
}
