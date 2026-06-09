import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, callerKey } from "@/lib/rate-limit"
import { fetchSpotifyArtists } from "@/lib/spotify"

// Per-country detail: top artists (by minutes) + top listeners (by minutes).

type ArtistRow = { artist_id: string; artist_name: string; ms: number }
type ListenerRow = { user_id: string; username: string | null; avatar_url: string | null; ms: number }

export async function GET(req: NextRequest) {
  const cc = new URL(req.url).searchParams.get("cc")
  if (!cc || !/^[A-Za-z]{2}$/.test(cc)) {
    return NextResponse.json({ error: "missing_country" }, { status: 400 })
  }

  const limit = rateLimit(`mapcc:${callerKey(req)}`, 30, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ topArtists: [], topListeners: [] }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } })
  }

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ topArtists: [], topListeners: [] }, { status: 401 })

  const [{ data: artistsData }, { data: listenersData }] = await Promise.all([
    supabase.rpc("get_country_top_artists", { p_country: cc }),
    supabase.rpc("get_country_top_listeners", { p_country: cc }),
  ])

  const artistRows = (artistsData as ArtistRow[]) ?? []
  const listenerRows = (listenersData as ListenerRow[]) ?? []

  const images = await fetchSpotifyArtists(artistRows.map((a) => a.artist_id))

  const topArtists = artistRows.map((a) => {
    const meta = images.get(a.artist_id)
    return {
      artistId: a.artist_id,
      name: meta?.name ?? a.artist_name?.split(",")[0] ?? "Unknown",
      image: meta?.image ?? null,
      ms: Number(a.ms),
    }
  })

  const topListeners = listenerRows.map((l) => ({
    userId: l.user_id,
    username: l.username,
    avatarUrl: l.avatar_url,
    ms: Number(l.ms),
  }))

  return NextResponse.json({ topArtists, topListeners })
}
