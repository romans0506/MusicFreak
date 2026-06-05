import { NextRequest, NextResponse } from "next/server"
import { getSpotifyAppToken, spotifyCooldown, noteSpotify429 } from "@/lib/spotify"
import { rateLimit, callerKey } from "@/lib/rate-limit"

// Short-lived cache of search results so repeated/identical queries
// (and quick re-types) don't hit Spotify again.
const searchCache = new Map<string, { data: any; expiresAt: number }>()
const CACHE_TTL = 60_000 // 60s

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const q = url.searchParams.get("q")
  const type = url.searchParams.get("type") ?? "track"
  if (!q || q.trim().length < 2) return NextResponse.json({ tracks: [], artists: [] })

  // Our own rate limit: max 20 searches / 10s per caller.
  const limit = rateLimit(`search:${callerKey(req)}`, 20, 10_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { tracks: [], artists: [], rateLimited: true },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    )
  }

  const cacheKey = `${type}:${q.trim().toLowerCase()}`
  const cached = searchCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data)
  }

  // Spotify told us to back off — don't pile on, return empty gracefully.
  if (spotifyCooldown() > 0) {
    return NextResponse.json({ tracks: [], artists: [], rateLimited: true })
  }

  const token = await getSpotifyAppToken()
  if (!token) return NextResponse.json({ tracks: [], artists: [] })

  const params = new URLSearchParams({ q, type, limit: "10" })
  const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })

  if (res.status === 429) {
    noteSpotify429(res.headers.get("retry-after"))
    return NextResponse.json({ tracks: [], artists: [], rateLimited: true })
  }

  if (!res.ok) {
    console.error("[search] spotify error", res.status, await res.text())
    return NextResponse.json({ tracks: [], artists: [] })
  }

  const data = await res.json()

  let payload: any
  if (type === "artist") {
    payload = {
      artists: (data.artists?.items ?? []).map((a: any) => ({
        id: a.id,
        name: a.name,
        genres: a.genres ?? [],
        popularity: a.popularity,
        images: a.images ?? [],
      })),
    }
  } else {
    payload = {
      tracks: (data.tracks?.items ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        artists: t.artists?.map((a: any) => a.name).join(", "),
        artistIds: t.artists?.map((a: any) => a.id) ?? [],
        albumArt: t.album?.images?.[1]?.url ?? t.album?.images?.[0]?.url ?? null,
        durationMs: t.duration_ms,
        previewUrl: t.preview_url ?? null,
      })),
    }
  }

  searchCache.set(cacheKey, { data: payload, expiresAt: Date.now() + CACHE_TTL })
  return NextResponse.json(payload)
}
