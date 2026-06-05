import { createClient } from "@/lib/supabase/server"
import GamesGrid from "@/components/games-grid"

export default async function AppPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const displayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.email?.split("@")[0] ??
    "there"

  const firstName = displayName.split(" ")[0]

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Hey, {firstName} 👋
        </h1>
        <p className="mt-2 text-muted-foreground">Pick a game and start earning points.</p>
      </div>
      <GamesGrid />
    </div>
  )
}
