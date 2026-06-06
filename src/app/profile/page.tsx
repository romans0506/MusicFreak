import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import ProfileView from "@/components/profile-view"

export default async function ProfilePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/")

  const [{ data: scores }, { data: leaderboard }, { data: favoriteSongs }, { data: profile }, { data: mostPlayed }] = await Promise.all([
    supabase
      .from("scores")
      .select("id, game_type, points, played_at")
      .eq("user_id", user.id)
      .order("played_at", { ascending: false })
      .limit(10),
    supabase
      .from("leaderboard")
      .select("id, total_points, games_played"),
    supabase
      .from("favorite_songs")
      .select("id, track_id, name, artists, album_art")
      .eq("user_id", user.id)
      .order("added_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("username, bio, custom_avatar_url, banner_url, country")
      .eq("id", user.id)
      .single(),
    supabase
      .rpc("get_play_counts", { p_since: null })
      .limit(5),
  ])

  // Use the same aggregated totals the leaderboard shows (full history),
  // not just the last 10 scores fetched above for the activity list.
  const myRow = leaderboard?.find((r) => r.id === user.id)
  const totalPoints = myRow?.total_points ?? (scores?.reduce((sum, s) => sum + s.points, 0) ?? 0)
  const gamesPlayed = myRow?.games_played ?? (scores?.length ?? 0)
  const rank = leaderboard
    ? leaderboard.findIndex((r) => r.id === user.id) + 1
    : null

  return (
    <ProfileView
      user={user}
      scores={scores ?? []}
      totalPoints={totalPoints}
      gamesPlayed={gamesPlayed}
      rank={rank || null}
      favoriteSongs={favoriteSongs ?? []}
      profile={profile ?? null}
      mostPlayed={mostPlayed ?? []}
    />
  )
}
