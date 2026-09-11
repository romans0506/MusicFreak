import { useRouter } from "expo-router";

import MultipleChoiceGame from "@/components/multiple-choice-game";
import { buildQuizQuestions } from "@/lib/games";

// Hard trivia about the world's biggest artists — not about your own taste.
// Questions come from the static bank in lib/music-trivia.ts, so this is the
// one game that needs no network at all and never dies with the Spotify token.
export default function MusicQuizScreen() {
  const router = useRouter();

  return (
    <MultipleChoiceGame
      onBack={() => router.back()}
      config={{
        title: "Music Quiz",
        subtitle: "How well do you really know music's biggest stars?",
        gameType: "music-quiz",
        load: async () => buildQuizQuestions(),
        icon: "sparkles",
        tint: "#3b82f6",
        rules: [
          "15 seconds per question",
          "Faster answers score more",
          "Hard trivia on the world's biggest artists",
        ],
        errorHint: "Something went wrong loading the quiz. Please try again.",
        // Questions carry no artist photo on mobile (that needs the app token),
        // so every card gets the styled "?" tile web falls back to.
        imagePlaceholder: true,
      }}
    />
  );
}
