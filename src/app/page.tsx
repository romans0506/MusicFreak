import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import Navbar from "@/components/navbar"
import Hero from "@/components/hero"
import SongOfDay from "@/components/song-of-day"
import GamesPreview from "@/components/games-preview"
import LeaderboardPreview from "@/components/leaderboard-preview"

export default async function Home() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect("/app")

  const today = new Date().toISOString().split("T")[0]

  const [{ data: dailyContent }, { data: leaders }] = await Promise.all([
    supabase
      .from("daily_content")
      .select("song_title, artist, year, lyric, gradient")
      .eq("date", today)
      .single(),
    supabase
      .from("leaderboard")
      .select("id, username, total_points")
      .limit(5),
  ])

  // Attach avatars (custom takes precedence over Spotify)
  const leaderIds = (leaders ?? []).map((l) => l.id)
  const { data: leaderProfiles } = leaderIds.length
    ? await supabase.from("profiles").select("id, avatar_url, custom_avatar_url").in("id", leaderIds)
    : { data: [] }
  const avatarById = new Map(
    (leaderProfiles ?? []).map((p) => [p.id, p.custom_avatar_url ?? p.avatar_url ?? null])
  )
  const leadersWithAvatar = (leaders ?? []).map((l) => ({
    ...l,
    avatar_url: avatarById.get(l.id) ?? null,
  }))

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main>
        <Hero />
        <SongOfDay song={dailyContent} />
        <GamesPreview />
        <LeaderboardPreview leaders={leadersWithAvatar} />
      </main>
      <footer className="border-t border-border py-10 text-center text-sm text-muted-foreground">
        © 2026 MusicFreak. Made with ♪ for music fans.
      </footer>
    </div>
  )
}
