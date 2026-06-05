import { createClient } from "@/lib/supabase/server"
import { resolveSpotifyUserToken, spotifyUserFetch } from "@/lib/spotify"
import StatsView from "@/components/stats-view"
import ShareWrapped from "@/components/share-wrapped"
import { computeStreak, computeBadges } from "@/lib/stats"

export type PlayCount = {
  track_id: string
  name: string
  artists: string | null
  album_art: string | null
  play_count: number
}

export type GenreSlice = { genre: string; count: number }

// Top genres from the user's top artists (Spotify is the only genre source).
async function topGenres(session: Parameters<typeof resolveSpotifyUserToken>[0]): Promise<GenreSlice[]> {
  const token = await resolveSpotifyUserToken(session)
  if (!token) return []

  const res = await spotifyUserFetch(
    "https://api.spotify.com/v1/me/top/artists?limit=50&time_range=medium_term",
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  )
  if (!res?.ok) return []

  const data = await res.json()
  const tally: Record<string, number> = {}
  for (const artist of data.items ?? []) {
    for (const g of artist.genres ?? []) tally[g] = (tally[g] ?? 0) + 1
  }
  return Object.entries(tally)
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
}

async function counts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  since: string | null
): Promise<PlayCount[]> {
  const { data } = await supabase
    .rpc("get_play_counts", { p_since: since })
    .limit(50)
  return (data as PlayCount[]) ?? []
}

export default async function StatsPage() {
  const supabase = await createClient()

  const now = Date.now()
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString()
  const monthAgo = new Date(now - 30 * 86_400_000).toISOString()

  const { data: { session } } = await supabase.auth.getSession()

  const [week, month, all, { data: days }, { data: hours }, { count: favArtists }, genres] = await Promise.all([
    counts(supabase, weekAgo),
    counts(supabase, monthAgo),
    counts(supabase, null),
    supabase.rpc("get_play_days", { p_tz: "UTC" }),
    supabase.rpc("get_play_hours", { p_tz: "UTC" }),
    supabase.from("favorite_artists").select("artist_id", { count: "exact", head: true }),
    topGenres(session),
  ])

  const totalPlays = all.reduce((sum, t) => sum + Number(t.play_count), 0)

  const dayList = ((days as { day: string }[]) ?? []).map((d) => d.day)
  const todayIso = new Date().toISOString().slice(0, 10)
  const streak = computeStreak(dayList, todayIso)

  const hourRows = (hours as { hour: number; plays: number }[]) ?? []
  const hasNightPlay = hourRows.some((h) => h.hour < 5 && Number(h.plays) > 0)

  // Normalize to a dense 24-slot array for the hourly chart.
  const hourly = Array.from({ length: 24 }, (_, h) => {
    const row = hourRows.find((r) => r.hour === h)
    return row ? Number(row.plays) : 0
  })

  const badges = computeBadges({
    totalPlays,
    uniqueTracks: all.length,
    currentStreak: streak.current,
    hasNightPlay,
    favoriteArtistCount: favArtists ?? 0,
  })

  return (
    <div>
      <div className="mb-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Listening Stats</h1>
          <p className="mt-2 text-muted-foreground">
            Plays we&apos;ve tracked since you started using MusicFreak.
          </p>
        </div>
        <ShareWrapped />
      </div>
      <StatsView
        week={week}
        month={month}
        all={all}
        totalPlays={totalPlays}
        streak={streak}
        badges={badges}
        hourly={hourly}
        genres={genres}
      />
    </div>
  )
}
