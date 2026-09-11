import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isSpotifyId } from "@/lib/spotify"
import { getArtistEvents, hasTicketmaster } from "@/lib/ticketmaster"
import { rateLimit, callerKey } from "@/lib/rate-limit"

/**
 * Upcoming Ticketmaster shows for a Spotify artist. The key stays server-side;
 * `configured: false` tells the UI to hide the section rather than show
 * "no upcoming shows".
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const artistId = searchParams.get("artistId")
  const name = (searchParams.get("name") ?? "").slice(0, 120)

  if (!isSpotifyId(artistId)) return NextResponse.json({ error: "missing_artist_id" }, { status: 400 })
  if (!name.trim()) return NextResponse.json({ error: "missing_name" }, { status: 400 })

  const limit = rateLimit(`events:${callerKey(req)}`, 20, 10_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { events: [], rateLimited: true },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    )
  }

  // Auth gate before any outbound call — the daily quota is shared.
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  if (!hasTicketmaster()) return NextResponse.json({ events: [], configured: false })

  const events = await getArtistEvents(artistId, name)
  return NextResponse.json({ events, configured: true })
}
