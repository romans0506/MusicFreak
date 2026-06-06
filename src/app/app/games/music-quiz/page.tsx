import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import MultipleChoiceGame from "@/components/multiple-choice-game"

export default async function MusicQuizPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/")

  return (
    <div className="mx-auto max-w-2xl">
      <MultipleChoiceGame
        config={{
          title: "Music Quiz",
          subtitle: "10 questions based on your Spotify taste",
          gameType: "music-quiz",
          endpoint: "/api/quiz/generate",
          icon: "brain",
          iconClass: "bg-blue-500/15 text-blue-400",
          rules: ["⏱ 15 seconds per question", "⚡ Faster answers = more points", "🏆 Max 1500 points"],
          errorHint: "Listen to more music on Spotify to unlock this game.",
        }}
      />
    </div>
  )
}
