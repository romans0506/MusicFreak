import { useRouter } from "expo-router";

import LyricSongGame from "@/components/lyric-song-game";

// Two modes, one engine — the wrapper picks which generator runs. See
// components/lyric-song-game.tsx.
export default function LyricSongScreen() {
  const router = useRouter();
  return <LyricSongGame onBack={() => router.back()} />;
}
