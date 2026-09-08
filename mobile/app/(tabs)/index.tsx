import { Pressable, ScrollView, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter, type Href } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/type";
import { cardSurface } from "@/theme/surfaces";

type SymbolName = Parameters<typeof IconSymbol>[0]["name"];

// The web app's three playable games, all now running on-device (lib/games.ts).
// Higher or Lower is absent on purpose: it's paused on web too, because its
// static artist pool needs ~200 single-artist Spotify calls to get real follower
// counts and those keep tripping the 429 that also breaks OAuth login.
const GAMES: {
  id: string;
  title: string;
  description: string;
  icon: SymbolName;
  tint: string;
  href: Href;
}[] = [
  {
    id: "name-song",
    title: "Name That Song",
    description: "Pick an artist and guess their song from a 5-second clip",
    icon: "headphones",
    tint: colors.primary,
    href: "/games/name-song",
  },
  {
    id: "music-quiz",
    title: "Music Quiz",
    description: "Questions about artists, albums and music history",
    icon: "sparkles",
    tint: "#3b82f6",
    href: "/games/music-quiz",
  },
  {
    id: "lyric-song",
    title: "Lyric → Song",
    description: "You're shown a line from a song — find out where it's from",
    icon: "music.note.list",
    tint: "#f59e0b",
    href: "/games/lyric-song",
  },
];

export default function GamesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 32 }}>
        <Animated.View entering={FadeInDown.duration(500)} style={{ marginBottom: 24 }}>
          <Text
            style={{ ...typography.screenTitle, color: colors.foreground }}>
            Games
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 15, marginTop: 4 }}>
            Every point counts towards the Leaderboard.
          </Text>
        </Animated.View>

        <View style={{ gap: 12 }}>
          {GAMES.map((game, i) => (
            <Animated.View key={game.id} entering={FadeInDown.delay(100 + i * 70).duration(500)}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(game.href);
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
                    backgroundColor: game.tint + "26",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                  <IconSymbol name={game.icon} size={22} color={game.tint} />
                </View>

                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ ...typography.section, color: colors.foreground }}>
                    {game.title}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 18 }}>
                    {game.description}
                  </Text>
                </View>

                <IconSymbol name="chevron.right" size={18} color={colors.mutedForeground} />
              </Pressable>
            </Animated.View>
          ))}
        </View>

        <Animated.View
          entering={FadeInDown.delay(380).duration(500)}
          style={{
            marginTop: 18,
            padding: 16,
            borderRadius: 16,
            borderCurve: "continuous",
            borderWidth: 1,
            borderColor: colors.border,
            borderStyle: "dashed",
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}>
          <IconSymbol name="lightbulb.fill" size={17} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, fontSize: 13, flex: 1, lineHeight: 18 }}>
            Scores sync with the web app both ways — one leaderboard, whichever you play on.
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
