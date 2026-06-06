import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import MultipleChoiceGame from "@/components/multiple-choice-game"

export default async function LyricSongPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/")

  return (
    <div className="mx-auto max-w-2xl">
      <MultipleChoiceGame
        config={{
          title: "Lyric → Song",
          subtitle: "Read a line, name the song it's from",
          gameType: "lyric-song",
          endpoint: "/api/games/lyric-song/generate",
          icon: "mic",
          iconClass: "bg-orange-500/15 text-orange-400",
          rules: ["⏱ 15 seconds per lyric", "⚡ Faster answers = more points", "🎤 Built from your top tracks"],
          errorHint: "We couldn't find lyrics for enough of your top tracks. Listen to more music and try again.",
        }}
      />
    </div>
  )
}
