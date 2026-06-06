import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const { game_type, points, artist_id, artist_name, artist_image } = await req.json()
  if (!game_type || points == null) return NextResponse.json({ error: "invalid" }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  // Per-artist games (Name That Song) attach the artist so we can build a
  // per-artist leaderboard. Other games omit these (columns stay null).
  const row: Record<string, unknown> = { user_id: user.id, game_type, points }
  if (artist_id) {
    row.artist_id = artist_id
    row.artist_name = artist_name ?? null
    row.artist_image = artist_image ?? null
  }

  const { error } = await supabase.from("scores").insert(row)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
