import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, callerKey } from "@/lib/rate-limit"

// Per-artist Name That Song leaderboard. Reads via a security-definer RPC
// (scores is owner-only under RLS, so cross-user reads need the function).

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const artistId = searchParams.get("artistId")
  if (!artistId) return NextResponse.json({ error: "missing_artist" }, { status: 400 })

  const limit = rateLimit(`nslb:${callerKey(req)}`, 30, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ leaders: [] }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_name_song_leaderboard", { p_artist_id: artistId })
  if (error) {
    console.error("[name-song leaderboard]", error.message)
    return NextResponse.json({ leaders: [] })
  }

  return NextResponse.json({ leaders: data ?? [] })
}
