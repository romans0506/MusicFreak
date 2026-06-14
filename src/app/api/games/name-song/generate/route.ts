import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, callerKey } from "@/lib/rate-limit"
import { findItunesArtistId, songsForArtist, normalize, shuffle, type ItunesSong } from "@/lib/itunes"

// Name That Song: a 5s audio clip of one of an artist's songs; guess which.
// Both the song list AND the 30s preview come from the free iTunes Search API
// (no auth). Sourcing both from one place guarantees the clip always matches
// its label, and gives the artist's whole catalog — not just tracks the user
// has played (Spotify's preview_url is null on most tracks, so it can't be the
// audio source anyway). The iTunes helpers live in src/lib/itunes.ts (shared
// with Lyric → Song's "by artist" mode).

type Candidate = ItunesSong & { previewUrl: string }
type Option = { name: string; albumArt: string | null }
type Round = { id: string; previewUrl: string; options: Option[]; correctIndex: number }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const artistName = (searchParams.get("artistName") ?? "").trim().slice(0, 100)
  if (!artistName) return NextResponse.json({ error: "missing_artist" }, { status: 400 })

  const limit = rateLimit(`namesong:${callerKey(req)}`, 8, 30_000)
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } })
  }

  // Require a session (consistent with other game routes / abuse protection).
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: "no_token" }, { status: 401 })

  const artistId = await findItunesArtistId(artistName)
  if (!artistId) return NextResponse.json({ error: "artist_not_found" }, { status: 422 })

  // Name That Song needs audio, so keep only tracks with a usable preview.
  const candidates = (await songsForArtist(artistId, artistName)).filter(
    (s): s is Candidate => !!s.previewUrl
  )
  if (candidates.length < 4) return NextResponse.json({ error: "not_enough_tracks" }, { status: 422 })

  // Every candidate already has a working preview, so we can build full rounds.
  const rounds: Round[] = []
  for (const track of shuffle(candidates)) {
    const wrong = shuffle(candidates.filter((c) => normalize(c.name) !== normalize(track.name))).slice(0, 3)
    if (wrong.length < 3) continue
    const picked = shuffle([track, ...wrong])
    rounds.push({
      id: `ns-${track.id}`,
      previewUrl: track.previewUrl,
      options: picked.map((c) => ({ name: c.name, albumArt: c.albumArt })),
      correctIndex: picked.indexOf(track),
    })
    if (rounds.length >= 10) break
  }

  if (rounds.length < 1) return NextResponse.json({ error: "not_enough_tracks" }, { status: 422 })

  return NextResponse.json({ rounds })
}
