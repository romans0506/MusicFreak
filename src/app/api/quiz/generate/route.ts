import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, callerKey } from "@/lib/rate-limit"
import { spotifyUserFetch, spotifyCooldown, resolveSpotifyUserToken } from "@/lib/spotify"

export type Question = {
  id: string
  type: "artist-of-song" | "song-of-artist"
  question: string
  image: string | null
  options: string[]
  correctIndex: number
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}

function pick<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n)
}

export async function GET(req: Request) {
  const limit = rateLimit(`quiz:${callerKey(req)}`, 10, 30_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    )
  }

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: "no_token" }, { status: 401 })

  // Spotify told us to back off — fail fast rather than pile on.
  if (spotifyCooldown() > 0) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(spotifyCooldown()) } }
    )
  }

  const token = await resolveSpotifyUserToken(session)
  if (!token) return NextResponse.json({ error: "no_token" }, { status: 401 })

  const headers = { Authorization: `Bearer ${token}` }

  const [tracksRes, artistsRes] = await Promise.all([
    spotifyUserFetch("https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=long_term", { headers, cache: "no-store" }),
    spotifyUserFetch("https://api.spotify.com/v1/me/top/artists?limit=20&time_range=long_term", { headers, cache: "no-store" }),
  ])

  if (!tracksRes?.ok || !artistsRes?.ok) {
    return NextResponse.json({ error: "spotify_failed" }, { status: 500 })
  }

  const [tracksData, artistsData] = await Promise.all([tracksRes.json(), artistsRes.json()])

  const tracks: any[] = tracksData.items ?? []
  const artists: any[] = artistsData.items ?? []

  if (tracks.length < 4 || artists.length < 4) {
    return NextResponse.json({ error: "not_enough_data" }, { status: 422 })
  }

  const questions: Question[] = []

  // Type 1: "Who made this track?" — show track, pick correct artist + 3 wrong artists
  const tracksForType1 = pick(tracks, 5)
  for (const track of tracksForType1) {
    const correctArtist = track.artists?.[0]?.name
    if (!correctArtist) continue

    const wrongArtists = shuffle(
      artists.map((a: any) => a.name).filter((n: string) => n !== correctArtist)
    ).slice(0, 3)

    if (wrongArtists.length < 3) continue

    const options = shuffle([correctArtist, ...wrongArtists])
    questions.push({
      id: `aof-${track.id}`,
      type: "artist-of-song",
      question: `Who made "${track.name}"?`,
      image: track.album?.images?.[0]?.url ?? null,
      options,
      correctIndex: options.indexOf(correctArtist),
    })
  }

  // Type 2: "Which of these is a [artist] song?" — show artist, pick 1 correct + 3 wrong tracks
  const artistsForType2 = pick(artists, 5)
  for (const artist of artistsForType2) {
    const correctTrack = tracks.find((t: any) =>
      t.artists?.some((a: any) => a.id === artist.id)
    )
    if (!correctTrack) continue

    const wrongTracks = shuffle(
      tracks.filter((t: any) => !t.artists?.some((a: any) => a.id === artist.id))
    ).slice(0, 3)

    if (wrongTracks.length < 3) continue

    const options = shuffle([correctTrack.name, ...wrongTracks.map((t: any) => t.name)])
    questions.push({
      id: `soa-${artist.id}`,
      type: "song-of-artist",
      question: `Which of these is a ${artist.name} song?`,
      image: artist.images?.[0]?.url ?? null,
      options,
      correctIndex: options.indexOf(correctTrack.name),
    })
  }

  return NextResponse.json({ questions: shuffle(questions).slice(0, 10) })
}
