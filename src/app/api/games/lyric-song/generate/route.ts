import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, callerKey } from "@/lib/rate-limit"
import { spotifyUserFetch, spotifyCooldown, resolveSpotifyUserToken } from "@/lib/spotify"
import { findItunesArtistId, songsForArtist, shuffle } from "@/lib/itunes"

// Lyric → Song. Lyrics always come from lrclib.net (free, no auth); we show a
// snippet and the player picks which of 4 songs it's from. Two modes:
//   - default     → songs from the user's Spotify top tracks
//   - ?artistName → songs from one artist's iTunes catalog (lyrics still lrclib)
// The "by artist" mode exists because many users' top tracks have no lrclib
// entry — picking a well-covered artist reliably fills a full round.

type Question = {
  id: string
  question: string
  hint: string | null
  image: string | null
  options: string[]
  correctIndex: number
}

/** A song we can try to build a lyric question from. */
type Song = { id: string; name: string; artist: string }

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

async function fetchLyrics(name: string, artist: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ track_name: name, artist_name: artist })
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

const TARGET_QUESTIONS = 10
// lrclib rate-limits bursts hard: ~20 parallel requests get 429'd down to ~6
// successes (which is why rounds were stuck at 6). Tested live: up to ~5
// concurrent requests all return 200, ~20 do not. So we fetch through a small
// worker pool and stop as soon as we have enough. (Note: lrclib limits by our
// server IP, shared across users — keep this modest.)
const LRCLIB_CONCURRENCY = 5

/**
 * Resolve lyrics for a sample of songs and turn the ones that work into
 * questions. `allNames` is the full pool the wrong answers are drawn from
 * (whole top-50 / whole artist catalog), so distractors aren't limited to the
 * sampled songs. Caps at TARGET_QUESTIONS, fetching lrclib with bounded
 * concurrency to avoid its burst throttling.
 */
async function buildQuestions(sample: Song[], allNames: string[], hint: string): Promise<Question[]> {
  const questions: Question[] = []
  let next = 0

  async function worker() {
    while (next < sample.length && questions.length < TARGET_QUESTIONS) {
      const song = sample[next++]
      const plain = await fetchLyrics(song.name, song.artist)
      if (!plain || questions.length >= TARGET_QUESTIONS) continue

      const snippet = pickSnippet(plain, song.name, song.artist)
      if (!snippet) continue

      const wrong = shuffle(allNames.filter((n) => n !== song.name)).slice(0, 3)
      if (wrong.length < 3) continue

      const options = shuffle([song.name, ...wrong])
      questions.push({
        id: `lyric-${song.id}`,
        question: snippet,
        hint,
        image: null, // lyric game is text-only — never show artwork (it'd hint the answer)
        options,
        correctIndex: options.indexOf(song.name),
      })
    }
  }

  await Promise.all(Array.from({ length: LRCLIB_CONCURRENCY }, worker))
  return questions.slice(0, TARGET_QUESTIONS)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const artistName = (searchParams.get("artistName") ?? "").trim().slice(0, 100)

  const limit = rateLimit(`lyric:${callerKey(req)}`, 6, 30_000)
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } })
  }

  // Require a session (consistent with other game routes / abuse protection).
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: "no_token" }, { status: 401 })

  // ── Mode: by artist (iTunes catalog → lrclib lyrics, no Spotify needed) ──
  if (artistName) {
    const artistId = await findItunesArtistId(artistName)
    if (!artistId) return NextResponse.json({ error: "artist_not_found" }, { status: 422 })

    const songs = await songsForArtist(artistId, artistName)
    if (songs.length < 4) return NextResponse.json({ error: "not_enough_tracks" }, { status: 422 })

    const allNames = songs.map((s) => s.name)
    const sample: Song[] = shuffle(songs)
      .slice(0, 40)
      .map((s) => ({ id: s.id, name: s.name, artist: artistName }))

    const questions = await buildQuestions(sample, allNames, `Which ${artistName} song is this?`)
    if (questions.length < 3) return NextResponse.json({ error: "not_enough_lyrics" }, { status: 422 })
    return NextResponse.json({ questions })
  }

  // ── Mode: your top 50 (Spotify) ──
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
  const allTracks: Song[] = (tracksData.items ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    artist: t.artists?.[0]?.name ?? "",
  }))

  if (allTracks.length < 4) return NextResponse.json({ error: "not_enough_data" }, { status: 422 })

  const allNames = allTracks.map((t) => t.name)
  // Many tracks (non-English/niche) have no lrclib entry, so we sample wide to
  // reliably reach the 10-question cap.
  const sample = shuffle(allTracks).slice(0, 35)

  const questions = await buildQuestions(sample, allNames, "Which song is this lyric from?")
  if (questions.length < 3) return NextResponse.json({ error: "not_enough_lyrics" }, { status: 422 })
  return NextResponse.json({ questions })
}
