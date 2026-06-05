import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import MusicQuizGame from "@/components/music-quiz-game"

export default async function MusicQuizPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/")

  return (
    <div className="mx-auto max-w-2xl">
      <MusicQuizGame userId={user.id} />
    </div>
  )
}
