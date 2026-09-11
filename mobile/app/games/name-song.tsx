import { useRouter } from "expo-router";

import NameSongGame from "@/components/name-song-game";
import { useSession } from "@/lib/auth";

// Pick an artist, hear 5 seconds, name the track. `userId` only marks "(you)"
// in the per-artist leaderboard on the end screen — the score itself is written
// against the session server-side by RLS.
export default function NameSongScreen() {
  const router = useRouter();
  const { session } = useSession();
  return <NameSongGame onBack={() => router.back()} userId={session?.user?.id ?? null} />;
}
