import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, callerKey } from "@/lib/rate-limit"
import { HIGHER_LOWER_ARTISTS } from "@/lib/higher-lower-artists"

// Higher or Lower: returns the static pool of globally famous artists.
// The client plays an endless survival game (pairs until the first mistake).
// No Spotify calls at runtime — the pool is a baked-in snapshot.

export async function GET(req: Request) {
  const limit = rateLimit(`higherlower:${callerKey(req)}`, 30, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ artists: [] }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } })
  }

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ artists: [] }, { status: 401 })

  return NextResponse.json({ artists: HIGHER_LOWER_ARTISTS })
}
