import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit } from "@/lib/rate-limit"
import { isSpotifyId } from "@/lib/spotify"

// Must match the scores.game_type CHECK constraint in Supabase.
const GAME_TYPES = new Set(["guess-second", "higher-lower", "music-quiz", "lyric-song"])

// Generous ceiling: no game can legitimately produce more than this in one run.
const MAX_POINTS = 10_000

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 })
  }
  const { game_type, points, artist_id, artist_name, artist_image } = body ?? {}

  if (typeof game_type !== "string" || !GAME_TYPES.has(game_type)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 })
  }
  if (typeof points !== "number" || !Number.isInteger(points) || points < 0 || points > MAX_POINTS) {
    return NextResponse.json({ error: "invalid" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  // Keyed by user id (not IP): can't be dodged via X-Forwarded-For spoofing.
  const limit = rateLimit(`scores:${user.id}`, 20, 60_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    )
  }

  // Per-artist games (Name That Song) attach the artist so we can build a
  // per-artist leaderboard. Other games omit these (columns stay null).
  const row: Record<string, unknown> = { user_id: user.id, game_type, points }
  if (artist_id) {
    if (!isSpotifyId(artist_id)) return NextResponse.json({ error: "invalid" }, { status: 400 })
    row.artist_id = artist_id
    row.artist_name = typeof artist_name === "string" ? artist_name.slice(0, 200) : null
    row.artist_image =
      typeof artist_image === "string" && artist_image.startsWith("https://")
        ? artist_image.slice(0, 600)
        : null
  }

  const { error } = await supabase.from("scores").insert(row)
  if (error) {
    console.error("[scores]", error.message)
    return NextResponse.json({ error: "insert_failed" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
