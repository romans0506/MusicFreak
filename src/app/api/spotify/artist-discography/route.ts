import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getSpotifyAppToken, noteSpotify429, spotifyCooldown, spotifyUserFetch, resolveSpotifyUserToken } from "@/lib/spotify"
import { rateLimit, callerKey } from "@/lib/rate-limit"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const artistId = searchParams.get("artistId")
  if (!artistId) return NextResponse.json({ error: "missing_artist_id" }, { status: 400 })

  // Our own rate limit: this route fans out into many Spotify calls,
  // so keep it tight — max 6 / 10s per caller.
  const limit = rateLimit(`discography:${callerKey(req)}`, 6, 10_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { tracks: [], rateLimited: true },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    )
  }

  // Try full discography via app token
  const appToken = await getSpotifyAppToken()

  if (appToken) {
    const appHeaders = { Authorization: `Bearer ${appToken}` }
    const albumsRes = await fetch(
      `https://api.spotify.com/v1/artists/${artistId}/albums?limit=20`,
      { headers: appHeaders, cache: "no-store" }
    )

    if (albumsRes.status === 429) {
      noteSpotify429(albumsRes.headers.get("retry-after"))
    } else if (albumsRes.ok) {
      const albumsData = await albumsRes.json()
      // Cap the fan-out: each album = one more Spotify call. 12 albums is
      // plenty for a discography view and keeps us well under the rate limit.
      const albums: any[] = (albumsData.items ?? []).slice(0, 12)

      const tracksByAlbum = await Promise.all(
        albums.map(async (album: any) => {
          const res = await fetch(
            `https://api.spotify.com/v1/albums/${album.id}/tracks?limit=50`,
            { headers: appHeaders, cache: "no-store" }
          )
          if (res.status === 429) noteSpotify429(res.headers.get("retry-after"))
          if (!res.ok) return []
          const data = await res.json()
          return (data.items ?? []).map((t: any) => ({
            id: t.id,
            name: t.name,
            artists: t.artists?.map((a: any) => a.name).join(", "),
            durationMs: t.duration_ms,
            previewUrl: t.preview_url ?? null,
            albumId: album.id,
            albumName: album.name,
            albumArt: album.images?.[0]?.url ?? null,
            albumYear: album.release_date?.slice(0, 4) ?? "",
            trackNumber: t.track_number,
          }))
        })
      )

      const seen = new Set<string>()
      const tracks = tracksByAlbum.flat().filter((t) => {
        const key = t.name.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      return NextResponse.json({ tracks, source: "discography" })
    }

    const detail = await albumsRes.text()
    console.error("[discography] albums endpoint failed", albumsRes.status, detail)
  }

  // Fallback: user's listening history
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: "no_token" }, { status: 401 })

  // If a 429 above tripped the cool-down, don't keep hammering with the fallback.
  if (spotifyCooldown() > 0) return NextResponse.json({ tracks: [], rateLimited: true })

  const userToken = await resolveSpotifyUserToken(session)
  if (!userToken) return NextResponse.json({ error: "no_token" }, { status: 401 })

  const userHeaders = { Authorization: `Bearer ${userToken}` }

  const requests = [
    ["short_term", 0], ["short_term", 50],
    ["medium_term", 0], ["medium_term", 50],
    ["long_term", 0], ["long_term", 50],
  ] as const

  const responses = await Promise.all(
    requests.map(([range, offset]) =>
      spotifyUserFetch(
        `https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=${range}&offset=${offset}`,
        { headers: userHeaders, cache: "no-store" }
      )
    )
  )

  const allData = await Promise.all(
    responses.map((r) => (r?.ok ? r.json() : Promise.resolve({ items: [] })))
  )

  const seen = new Set<string>()
  const tracks = allData
    .flatMap((d) => d.items ?? [])
    .filter((t: any) => t.artists?.some((a: any) => a.id === artistId))
    .filter((t: any) => {
      if (seen.has(t.id)) return false
      seen.add(t.id)
      return true
    })
    .map((t: any) => ({
      id: t.id,
      name: t.name,
      artists: t.artists?.map((a: any) => a.name).join(", "),
      durationMs: t.duration_ms,
      previewUrl: t.preview_url ?? null,
      albumId: t.album?.id ?? "",
      albumName: t.album?.name ?? "",
      albumArt: t.album?.images?.[0]?.url ?? null,
      albumYear: t.album?.release_date?.slice(0, 4) ?? "",
      trackNumber: t.track_number ?? 0,
    }))

  return NextResponse.json({ tracks, source: "history" })
}
