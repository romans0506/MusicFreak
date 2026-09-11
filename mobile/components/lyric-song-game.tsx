import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ArtistPicker } from "@/components/artist-picker";
import { GameHeader } from "@/components/game-header";
import MultipleChoiceGame, { type QuizConfig } from "@/components/multiple-choice-game";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  buildLyricQuestionsForArtist,
  buildLyricQuestionsFromTopTracks,
  type GameArtist,
} from "@/lib/games";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/type";
import { cardSurface } from "@/theme/surfaces";

/**
 * Lyric → Song: choose a mode, then hand off to the shared gameplay engine —
 * the mobile twin of the web src/components/lyric-song-game.tsx, where the mode
 * only ever swaps which generator the engine calls.
 *
 *   Your Top 50 → lyrics for tracks you actually listen to (/me/top/tracks)
 *   By Artist   → lyrics from one artist's iTunes catalogue
 *
 * "By Artist" exists on web because many people's top tracks have no lrclib
 * entry. On the device it earns its place twice over: nothing in it touches
 * Spotify, so it works even with Spotify disconnected or unreachable.
 */

const TINT = "#f59e0b";

type Mode = "top" | "artist";

function topConfig(): QuizConfig {
  return {
    title: "Lyric → Song",
    subtitle: "Read a line, name the song it's from",
    gameType: "lyric-song",
    load: buildLyricQuestionsFromTopTracks,
    icon: "music.note.list",
    tint: TINT,
    rules: ["15 seconds per lyric", "Faster answers score more", "Built from your top tracks"],
    loadingHint: "Looking up lyrics — this takes a few seconds",
    errorHint:
      "We couldn't find lyrics for enough of your top tracks. Try 'By Artist' instead, or listen to more music and come back.",
  };
}

function artistConfig(artist: GameArtist): QuizConfig {
  return {
    title: "Lyric → Song",
    subtitle: `Guess ${artist.name}'s songs from a line`,
    gameType: "lyric-song",
    load: () => buildLyricQuestionsForArtist(artist.name),
    icon: "music.note.list",
    tint: TINT,
    rules: ["15 seconds per lyric", "Faster answers score more", `${artist.name}'s catalogue`],
    loadingHint: "Looking up lyrics — this takes a few seconds",
    errorHint: `We couldn't find lyrics for enough of ${artist.name}'s songs. Try another artist.`,
  };
}

function ModeCard({
  icon,
  tint,
  title,
  description,
  onPress,
}: {
  icon: Parameters<typeof IconSymbol>[0]["name"];
  tint: string;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => ({
        ...cardSurface,
        backgroundColor: pressed ? colors.cardPressed : colors.card,
        padding: 18,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
      })}>
      <View
        style={{
          width: 50,
          height: 50,
          borderRadius: 16,
          borderCurve: "continuous",
          backgroundColor: tint + "26",
          alignItems: "center",
          justifyContent: "center",
        }}>
        <IconSymbol name={icon} size={22} color={tint} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ ...typography.section, color: colors.foreground }}>{title}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 18 }}>
          {description}
        </Text>
      </View>
      <IconSymbol name="chevron.right" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function LyricSongGame({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode | null>(null);
  const [artist, setArtist] = useState<GameArtist | null>(null);

  function reset() {
    setMode(null);
    setArtist(null);
  }

  const config = mode === "top" ? topConfig() : artist ? artistConfig(artist) : null;

  // A mode is fully chosen — hand off to the gameplay engine. Backing out of it
  // returns to the mode chooser, not out of the game.
  if (config) return <MultipleChoiceGame config={config} onBack={reset} />;

  // "By artist" chosen but no artist yet.
  if (mode === "artist") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <GameHeader onBack={reset} />
        <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: insets.bottom }}>
          <Animated.View entering={FadeInDown.duration(450)} style={{ marginBottom: 22 }}>
            <Text style={{ ...typography.screenTitle, color: colors.foreground }}>
              Pick an artist
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 15, marginTop: 6 }}>
              Guess their songs from a single line.
            </Text>
          </Animated.View>
          <ArtistPicker onPick={setArtist} />
        </View>
      </View>
    );
  }

  // Mode chooser.
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GameHeader onBack={onBack} />
      <View style={{ flex: 1, paddingHorizontal: 20 }}>
        <Animated.View entering={FadeInDown.duration(450)} style={{ alignItems: "center" }}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 28,
              borderCurve: "continuous",
              backgroundColor: TINT + "26",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 20,
              shadowColor: TINT,
              shadowOpacity: 0.3,
              shadowRadius: 22,
              shadowOffset: { width: 0, height: 10 },
              elevation: 8,
            }}>
            <IconSymbol name="music.note.list" size={40} color={TINT} />
          </View>
          <Text
            style={{ ...typography.screenTitle, color: colors.foreground, marginTop: 22 }}>
            Lyric → Song
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 15, marginTop: 6 }}>
            Choose how you want to play
          </Text>
        </Animated.View>

        <View style={{ gap: 12, marginTop: 32 }}>
          <Animated.View entering={FadeInDown.delay(120).duration(450)}>
            <ModeCard
              icon="music.note"
              tint={colors.primary}
              title="Your Top 50"
              description="Lyrics from tracks you actually listen to"
              onPress={() => setMode("top")}
            />
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(200).duration(450)}>
            <ModeCard
              icon="music.mic"
              tint={TINT}
              title="By Artist"
              description="Pick any artist and guess their songs"
              onPress={() => setMode("artist")}
            />
          </Animated.View>
        </View>
      </View>
    </View>
  );
}
