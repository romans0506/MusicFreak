import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, callerKey } from "@/lib/rate-limit"
import { spotifyUserFetch, spotifyCooldown, resolveSpotifyUserToken } from "@/lib/spotify"

// Lyric → Song. Lyrics come from lrclib.net — a free, no-auth lyrics API.
// We show a snippet of lyrics and the player picks which of 4 songs it's from.

type Question = {
  id: string
  question: string
  hint: string | null
  image: string | null
  options: string[]
  correctIndex: number
}

type TopTrack = { id: string; name: string; artist: string }

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}

/**
 * Pull a short, fair lyric snippet: a window of 2 consecutive lines from
 * roughly the middle, skipping lines that contain the song title or artist
 * (which would give the answer away).
 */
function pickSnippet(plain: string, title: string, artist: string): string | null {
  const lines = plain
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => l.length >= 8 && l.length <= 60)

  const titleLc = title.toLowerCase()
  const artistLc = artist.toLowerCase()
  const safe = lines.filter(
    (l) => !l.toLowerCase().includes(titleLc) && !l.toLowerCase().includes(artistLc)
  )
  if (safe.length < 2) return null

  // Prefer a window from the middle third of the song.
  const start = Math.max(0, Math.floor(safe.length / 3))
  const candidates = safe.slice(start)
  const idx = Math.floor(Math.random() * Math.max(1, candidates.length - 1))
  return [candidates[idx], candidates[idx + 1]].filter(Boolean).join("\n")
}

async function fetchLyrics(track: TopTrack): Promise<string | null> {
  try {
    const params = new URLSearchParams({ track_name: track.name, artist_name: track.artist })
    const res = await fetch(`https://lrclib.net/api/search?${params}`, {
      headers: { "User-Agent": "MusicFreak (https://musicfreak.app)" },
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data)) return null
    const hit = data.find((d: any) => !d.instrumental && typeof d.plainLyrics === "string" && d.plainLyrics.length > 40)
    return hit?.plainLyrics ?? null
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  const limit = rateLimit(`lyric:${callerKey(req)}`, 6, 30_000)
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } })
  }

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: "no_token" }, { status: 401 })

  if (spotifyCooldown() > 0) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(spotifyCooldown()) } })
  }

  const token = await resolveSpotifyUserToken(session)
  if (!token) return NextResponse.json({ error: "no_token" }, { status: 401 })

  const tracksRes = await spotifyUserFetch(
    "https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term",
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  )
  if (!tracksRes?.ok) return NextResponse.json({ error: "spotify_failed" }, { status: 500 })

  const tracksData = await tracksRes.json()
  const allTracks: TopTrack[] = (tracksData.items ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    artist: t.artists?.[0]?.name ?? "",
  }))

  if (allTracks.length < 4) return NextResponse.json({ error: "not_enough_data" }, { status: 422 })

  // Try lyrics for a generous sample; keep the ones that resolve.
  const sample = shuffle(allTracks).slice(0, 18)
  const withLyrics = await Promise.all(
    sample.map(async (t) => ({ track: t, plain: await fetchLyrics(t) }))
  )

  const usable = withLyrics.filter((x): x is { track: TopTrack; plain: string } => !!x.plain)
  if (usable.length < 4) return NextResponse.json({ error: "not_enough_lyrics" }, { status: 422 })

  const allNames = allTracks.map((t) => t.name)
  const questions: Question[] = []

  for (const { track, plain } of usable) {
    const snippet = pickSnippet(plain, track.name, track.artist)
    if (!snippet) continue

    const wrong = shuffle(allNames.filter((n) => n !== track.name)).slice(0, 3)
    if (wrong.length < 3) continue

    const options = shuffle([track.name, ...wrong])
    questions.push({
      id: `lyric-${track.id}`,
      question: snippet,
      hint: "Which song is this lyric from?",
      image: null,
      options,
      correctIndex: options.indexOf(track.name),
    })
    if (questions.length >= 10) break
  }

  if (questions.length < 3) return NextResponse.json({ error: "not_enough_lyrics" }, { status: 422 })

  return NextResponse.json({ questions })
}
