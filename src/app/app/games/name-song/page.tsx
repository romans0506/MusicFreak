import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import NameSongGame from "@/components/name-song-game"

export default async function NameSongPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/")

  return (
    <div className="mx-auto max-w-2xl">
      <NameSongGame userId={user.id} />
    </div>
  )
}
