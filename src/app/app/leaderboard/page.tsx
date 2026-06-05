import { createClient } from "@/lib/supabase/server"
import LeaderboardFull from "@/components/leaderboard-full"

export default async function LeaderboardPage() {
  const supabase = await createClient()

  const [{ data: { user } }, { data: leaders }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("leaderboard").select("id, username, total_points").limit(50),
  ])

  // Fetch avatars from profiles (custom avatar takes precedence over Spotify)
  const ids = (leaders ?? []).map((l) => l.id)
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, avatar_url, custom_avatar_url").in("id", ids)
    : { data: [] }

  const avatarById = new Map(
    (profiles ?? []).map((p) => [p.id, p.custom_avatar_url ?? p.avatar_url ?? null])
  )

  const leadersWithAvatar = (leaders ?? []).map((l) => ({
    ...l,
    avatar_url: avatarById.get(l.id) ?? null,
  }))

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Leaderboard</h1>
        <p className="mt-2 text-muted-foreground">Top players by total points.</p>
      </div>
      <LeaderboardFull leaders={leadersWithAvatar} currentUserId={user?.id ?? null} />
    </div>
  )
}
