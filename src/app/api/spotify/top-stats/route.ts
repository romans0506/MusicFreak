import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, callerKey } from "@/lib/rate-limit"
import { spotifyUserFetch, spotifyCooldown } from "@/lib/spotify"

const topStatsCache = new Map<string, { data: unknown; expiresAt: number }>()
const TOP_STATS_TTL = 5 * 60_000 // 5 minutes

export async function GET(req: Request) {
  const limit = rateLimit(`top-stats:${callerKey(req)}`, 4, 60_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    )
  }

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.provider_token) return NextResponse.json({ error: "no_token" }, { status: 401 })

  const userId = session.user.id
  const cached = topStatsCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data)
  }

  // Spotify told us to back off — serve nothing rather than pile on.
  if (spotifyCooldown() > 0) {
    return NextResponse.json({ topArtists: [], topTracks: [], topAlbums: [], rateLimited: true })
  }

  const headers = { Authorization: `Bearer ${session.provider_token}` }

  const [artistsRes, tracksRes] = await Promise.all([
    spotifyUserFetch("https://api.spotify.com/v1/me/top/artists?limit=5&time_range=short_term", { headers, cache: "no-store" }),
    spotifyUserFetch("https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=short_term", { headers, cache: "no-store" }),
  ])

  const [artistsData, tracksData] = await Promise.all([
    artistsRes?.ok ? artistsRes.json() : { items: [] },
    tracksRes?.ok ? tracksRes.json() : { items: [] },
  ])

  const topArtists = (artistsData.items ?? []).slice(0, 5).map((a: any) => ({
    id: a.id,
    name: a.name,
    image: a.images?.[0]?.url,
    genres: a.genres?.slice(0, 1),
  }))

  const topTracks = (tracksData.items ?? []).slice(0, 5).map((t: any) => ({
    id: t.id,
    name: t.name,
    artists: t.artists?.map((a: any) => a.name).join(", "),
    albumArt: t.album?.images?.[0]?.url,
    popularity: t.popularity,
  }))

  // Derive top albums from top 50 tracks
  const albumMap: Record<string, { id: string; name: string; artist: string; image: string; count: number }> = {}
  for (const t of tracksData.items ?? []) {
    const albumId = t.album?.id
    if (!albumId) continue
    if (!albumMap[albumId]) {
      albumMap[albumId] = {
        id: albumId,
        name: t.album.name,
        artist: t.artists?.[0]?.name ?? "",
        image: t.album.images?.[0]?.url ?? "",
        count: 0,
      }
    }
    albumMap[albumId].count++
  }
  const topAlbums = Object.values(albumMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const result = { topArtists, topTracks, topAlbums }
  topStatsCache.set(userId, { data: result, expiresAt: Date.now() + TOP_STATS_TTL })
  return NextResponse.json(result)
}
