import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, callerKey } from "@/lib/rate-limit"

// Name That Song: a 5s audio clip of one of an artist's songs; guess which.
// Both the song list AND the 30s preview come from the free iTunes Search API
// (no auth). Sourcing both from one place guarantees the clip always matches
// its label, and gives the artist's whole catalog — not just tracks the user
// has played (Spotify's preview_url is null on most tracks, so it can't be the
// audio source anyway).

type Candidate = { id: string; name: string; previewUrl: string; albumArt: string | null }
type Option = { name: string; albumArt: string | null }
type Round = { id: string; previewUrl: string; options: Option[]; correctIndex: number }

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}

/** Strip version/feature suffixes so "Song - 2011 Remaster" ≈ "Song (Live)" ≈ "Song". */
function cleanTitle(name: string): string {
  return name
    .replace(/\s*[([][^)\]]*[)\]]/g, "") // remove (...) and [...]
    .replace(/\s*-\s.*$/, "") // remove " - <suffix>"
    .replace(/\s+/g, " ")
    .trim()
}

/** Loose comparison key: lowercase, strip accents and punctuation. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Find the iTunes artistId that best matches the given name. */
async function findItunesArtistId(artistName: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=musicArtist&limit=5&country=US`,
      { cache: "no-store" }
    )
    if (!res.ok) return null
    const data = await res.json()
    const results: any[] = data.results ?? []
    if (results.length === 0) return null
    const want = normalize(artistName)
    const exact = results.find((r) => normalize(r.artistName ?? "") === want)
    return (exact ?? results[0]).artistId ?? null
  } catch {
    return null
  }
}

/** Look up an artist's songs (with previews) by iTunes artistId. */
async function songsForArtist(artistId: number, artistName: string): Promise<Candidate[]> {
  try {
    const res = await fetch(
      `https://itunes.apple.com/lookup?id=${artistId}&entity=song&limit=200&country=US`,
      { cache: "no-store" }
    )
    if (!res.ok) return []
    const data = await res.json()
    const want = normalize(artistName)

    const seen = new Set<string>()
    const out: Candidate[] = []
    for (const r of data.results ?? []) {
      if (r.wrapperType !== "track" || r.kind !== "song") continue
      if (!r.previewUrl || !r.trackName) continue
      // Keep the artist's own tracks (drop tracks where they're only a feature).
      const got = normalize(r.artistName ?? "")
      if (want && !got.includes(want) && !want.includes(got)) continue

      const name = cleanTitle(r.trackName)
      const key = normalize(name)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const albumArt = (r.artworkUrl100 ?? "").replace("100x100", "300x300") || null
      out.push({ id: String(r.trackId), name, previewUrl: r.previewUrl, albumArt })
    }
    return out
  } catch {
    return []
  }
}

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

  const candidates = await songsForArtist(artistId, artistName)
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
