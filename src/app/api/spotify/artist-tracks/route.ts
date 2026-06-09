import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, callerKey } from "@/lib/rate-limit"
import { spotifyUserFetch, spotifyCooldown, resolveSpotifyUserToken, isSpotifyId } from "@/lib/spotify"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const artistId = searchParams.get("artistId")
  if (!isSpotifyId(artistId)) return NextResponse.json({ error: "Missing artistId" }, { status: 400 })

  const limit = rateLimit(`artist-tracks:${callerKey(request)}`, 15, 10_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { tracks: [], rateLimited: true },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    )
  }

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: "no_token" }, { status: 401 })

  // Spotify told us to back off — serve nothing rather than pile on.
  if (spotifyCooldown() > 0) return NextResponse.json({ tracks: [], rateLimited: true })

  const token = await resolveSpotifyUserToken(session)
  if (!token) return NextResponse.json({ error: "no_token" }, { status: 401 })

  const headers = { Authorization: `Bearer ${token}` }

  // Use user's top tracks (user-top-read scope) and filter by artist.
  // No separate /me token check — an expired token simply makes these !ok.
  const [shortRes, mediumRes, longRes] = await Promise.all([
    spotifyUserFetch("https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=short_term", { headers, cache: "no-store" }),
    spotifyUserFetch("https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term", { headers, cache: "no-store" }),
    spotifyUserFetch("https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=long_term", { headers, cache: "no-store" }),
  ])

  const allTracks: any[] = []
  const seen = new Set<string>()

  for (const res of [shortRes, mediumRes, longRes]) {
    if (!res?.ok) continue
    const data = await res.json()
    for (const track of data.items ?? []) {
      if (!seen.has(track.id) && track.artists?.some((a: any) => a.id === artistId)) {
        seen.add(track.id)
        allTracks.push(track)
      }
    }
  }

  const tracks = allTracks
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 10)

  return NextResponse.json({ tracks })
}
