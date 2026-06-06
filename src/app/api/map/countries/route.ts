import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, callerKey } from "@/lib/rate-limit"
import { fetchSpotifyArtists } from "@/lib/spotify"

// Top artist per country (by minutes listened) across all MusicFreak users,
// enriched with the artist's Spotify photo for the map fill.

type Row = {
  country: string
  artist_id: string
  artist_name: string
  artist_ms: number
  country_ms: number
  listeners: number
}

export async function GET(req: Request) {
  const limit = rateLimit(`map:${callerKey(req)}`, 20, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ countries: [] }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } })
  }

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ countries: [] }, { status: 401 })

  const { data, error } = await supabase.rpc("get_map_countries")
  if (error) {
    console.error("[map countries]", error.message)
    return NextResponse.json({ countries: [] })
  }

  const rows = (data as Row[]) ?? []
  const artists = await fetchSpotifyArtists(rows.map((r) => r.artist_id))

  const countries = rows.map((r) => {
    const meta = artists.get(r.artist_id)
    return {
      country: r.country, // ISO alpha-2
      artistId: r.artist_id,
      artistName: meta?.name ?? r.artist_name?.split(",")[0] ?? "Unknown",
      artistImage: meta?.image ?? null,
      artistMs: Number(r.artist_ms),
      countryMs: Number(r.country_ms),
      listeners: Number(r.listeners),
    }
  })

  return NextResponse.json({ countries })
}
