import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import LyricSongGame from "@/components/lyric-song-game"

export default async function LyricSongPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/")

  return (
    <div className="mx-auto max-w-2xl">
      <LyricSongGame />
    </div>
  )
}
