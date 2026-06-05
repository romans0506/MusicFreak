import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, callerKey } from "@/lib/rate-limit"
import { spotifyUserFetch, spotifyCooldown, resolveSpotifyUserToken } from "@/lib/spotify"

// Per-user throttle: don't re-poll Spotify more than once per window even if
// the page reloads (recently-played changes slowly). Survives across requests
// in-memory; resets on cold start, which is fine — we just re-poll once.
const lastIngest = new Map<string, number>()
const INGEST_THROTTLE = 30_000 // 30s

export async function POST(req: Request) {
  const limit = rateLimit(`ingest:${callerKey(req)}`, 10, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ ingested: 0, rateLimited: true }, { status: 429 })
  }

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ ingested: 0 }, { status: 401 })

  const userId = session.user.id

  // Throttle: skip Spotify entirely if we polled very recently.
  const last = lastIngest.get(userId) ?? 0
  if (Date.now() - last < INGEST_THROTTLE) {
    return NextResponse.json({ ingested: 0, throttled: true })
  }

  if (spotifyCooldown() > 0) return NextResponse.json({ ingested: 0, rateLimited: true })

  const token = await resolveSpotifyUserToken(session)
  if (!token) return NextResponse.json({ ingested: 0 }, { status: 401 })

  // Only fetch plays newer than the latest one we've already stored.
  const { data: latest } = await supabase
    .from("play_history")
    .select("played_at")
    .eq("user_id", userId)
    .order("played_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let url = "https://api.spotify.com/v1/me/player/recently-played?limit=50"
  if (latest?.played_at) {
    // Spotify's `after` cursor is a Unix timestamp in milliseconds.
    url += `&after=${Date.parse(latest.played_at)}`
  }

  const res = await spotifyUserFetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })

  // Mark the poll attempt regardless of outcome so a failing call doesn't loop.
  lastIngest.set(userId, Date.now())

  if (!res?.ok) return NextResponse.json({ ingested: 0 })

  const data = await res.json()
  const items: any[] = data.items ?? []
  if (items.length === 0) return NextResponse.json({ ingested: 0 })

  const rows = items
    .filter((entry) => entry.track?.id && entry.played_at)
    .map((entry) => ({
      user_id: userId,
      track_id: entry.track.id,
      name: entry.track.name,
      artists: entry.track.artists?.map((a: any) => a.name).join(", ") ?? "",
      artist_id: entry.track.artists?.[0]?.id ?? null,
      album_art: entry.track.album?.images?.[1]?.url ?? entry.track.album?.images?.[0]?.url ?? null,
      album_id: entry.track.album?.id ?? null,
      album_name: entry.track.album?.name ?? null,
      duration_ms: entry.track.duration_ms ?? null,
      played_at: entry.played_at,
    }))

  // Dedup on (user_id, played_at): re-seen plays are silently ignored.
  const { error } = await supabase
    .from("play_history")
    .upsert(rows, { onConflict: "user_id,played_at", ignoreDuplicates: true })

  if (error) return NextResponse.json({ ingested: 0, error: error.message }, { status: 500 })

  return NextResponse.json({ ingested: rows.length })
}
