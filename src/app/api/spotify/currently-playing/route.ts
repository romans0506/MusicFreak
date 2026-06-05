import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, callerKey } from "@/lib/rate-limit"
import { spotifyUserFetch, resolveSpotifyUserToken } from "@/lib/spotify"

// Per-user in-memory cache: userId → { data, expiresAt }
const nowPlayingCache = new Map<string, { data: unknown; expiresAt: number }>()
const NOW_PLAYING_TTL = 25_000 // 25s — slightly under the 30s poll interval

export async function GET(req: Request) {
  const limit = rateLimit(`now-playing:${callerKey(req)}`, 10, 30_000)
  if (!limit.allowed) return NextResponse.json({ playing: false, rateLimited: true }, { status: 429 })

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ playing: false })

  const userId = session.user.id
  const cached = nowPlayingCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data)
  }

  const token = await resolveSpotifyUserToken(session)
  if (!token) return NextResponse.json({ playing: false })

  const res = await spotifyUserFetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })

  // Cooling down from a 429 (res === null) or a non-OK response: degrade gracefully.
  if (!res || res.status === 204 || !res.ok) {
    const result = { playing: false }
    nowPlayingCache.set(userId, { data: result, expiresAt: Date.now() + NOW_PLAYING_TTL })
    return NextResponse.json(result)
  }

  const data = await res.json()
  if (!data?.item) {
    const result = { playing: false }
    nowPlayingCache.set(userId, { data: result, expiresAt: Date.now() + NOW_PLAYING_TTL })
    return NextResponse.json(result)
  }

  const result = {
    playing: data.is_playing,
    track: {
      id: data.item.id,
      name: data.item.name,
      artists: data.item.artists?.map((a: any) => a.name).join(", "),
      album: data.item.album?.name,
      albumArt: data.item.album?.images?.[0]?.url,
      durationMs: data.item.duration_ms,
      progressMs: data.progress_ms,
    },
  }
  nowPlayingCache.set(userId, { data: result, expiresAt: Date.now() + NOW_PLAYING_TTL })
  return NextResponse.json(result)
}
