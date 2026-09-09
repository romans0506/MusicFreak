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

/**
 * Top tracks for the table. The 50 is a DISPLAY cap.
 *
 * Never derive an aggregate from this list's length or sum — it saturates at 50
 * and silently stops growing. That's exactly how "plays" came to undercount
 * everyone past 50 distinct tracks, drifting further the more they listened.
 * Totals come from totalPlayCount() instead. (Mirrored in the Expo app's
 * app/(tabs)/stats.tsx.)
 */
async function counts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  since: string | null
): Promise<PlayCount[]> {
  const { data } = await supabase
    .rpc("get_play_counts", { p_since: since })
    .limit(50)
  return (data as PlayCount[]) ?? []
}

/**
 * Every play we've recorded. `play_history` holds one row per play, so a head
 * count *is* the total — exact, uncapped, and it transfers no rows at all.
 */
async function totalPlayCount(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<number> {
  const { count } = await supabase
    .from("play_history")
    .select("*", { count: "exact", head: true })
  return count ?? 0
}

export default async function StatsPage() {
  const supabase = await createClient()

  const now = Date.now()
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString()
  const monthAgo = new Date(now - 30 * 86_400_000).toISOString()

  const { data: { session } } = await supabase.auth.getSession()
  const uid = session?.user.id

  const [week, month, all, totalPlays, { data: days }, { data: hours }, { count: favArtists }, genres, { data: minutesRows }] = await Promise.all([
    counts(supabase, weekAgo),
    counts(supabase, monthAgo),
    counts(supabase, null),
    totalPlayCount(supabase),
    supabase.rpc("get_play_days", { p_tz: "UTC" }),
    supabase.rpc("get_play_hours", { p_tz: "UTC" }),
    // MUST be scoped to the user. `favorite_artists` is public-read (the artist
    // page lists a band's fans), so RLS does NOT narrow this to the caller — an
    // unfiltered count returns every user's rows and handed the Superfan badge
    // to accounts that had favourited nothing. Same fix in the Expo app.
    uid
      ? supabase
          .from("favorite_artists")
          .select("artist_id", { count: "exact", head: true })
          .eq("user_id", uid)
      : Promise.resolve({ count: 0 }),
    topGenres(session),
    supabase.rpc("get_listening_minutes"),
  ])

  const m = (minutesRows as Record<string, string | number | null>[] | null)?.[0]
  const listening = {
    day: Number(m?.day_ms ?? 0),
    week: Number(m?.week_ms ?? 0),
    month: Number(m?.month_ms ?? 0),
    year: Number(m?.year_ms ?? 0),
    total: Number(m?.total_ms ?? 0),
  }
  // How long we've been tracking this user — drives which periods are unlocked.
  const firstPlay = m?.first_play ? new Date(m.first_play as string).getTime() : null
  const trackedDays = firstPlay ? Math.floor((now - firstPlay) / 86_400_000) : 0

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
    // Saturates at the 50 above, which is fine *only* because the Explorer
    // badge asks ">= 50". Don't reuse this as a real distinct-track count.
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
        listening={listening}
        trackedDays={trackedDays}
      />
    </div>
  )
}
