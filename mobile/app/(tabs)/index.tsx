import { Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";

import { GlowBackground } from "@/components/glow-background";
import { colors } from "@/theme/colors";

const GAMES = [
  {
    id: "name-song",
    title: "Name That Song",
    description: "Pick an artist and guess their song from a 5-second clip",
    icon: "sf:headphones",
    tint: colors.primary,
  },
  {
    id: "music-quiz",
    title: "Music Quiz",
    description: "Questions about artists, albums and music history",
    icon: "sf:brain.head.profile",
    tint: "#3b82f6",
  },
  {
    id: "lyric-song",
    title: "Lyric → Song",
    description: "You're shown a line from a song — find out where it's from",
    icon: "sf:music.mic",
    tint: "#f59e0b",
  },
];

export default function GamesScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlowBackground />
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Animated.View entering={FadeInDown.duration(500)} style={{ gap: 6, marginBottom: 4 }}>
          <Text style={{ color: colors.foreground, fontSize: 34, fontWeight: "800", letterSpacing: -0.5 }}>
            Games
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 15 }}>
            Pick a game and test your music knowledge
          </Text>
        </Animated.View>

        {GAMES.map((game, i) => (
          <Animated.View key={game.id} entering={FadeInDown.delay(120 + i * 80).duration(500)}>
            <Pressable
              style={({ pressed }) => ({
                transform: [{ scale: pressed ? 0.97 : 1 }],
                backgroundColor: colors.card,
                borderRadius: 22,
                borderCurve: "continuous",
                padding: 18,
                borderWidth: 1,
                borderColor: colors.border,
              })}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 16,
                    borderCurve: "continuous",
                    backgroundColor: game.tint + "26",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                  <Image source={game.icon} tintColor={game.tint} style={{ width: 26, height: 26 }} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
                    {game.title}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 18 }}>
                    {game.description}
                  </Text>
                </View>
                <Text style={{ color: colors.mutedForeground, fontSize: 20, fontWeight: "300" }}>›</Text>
              </View>
            </Pressable>
          </Animated.View>
        ))}

        <Animated.View
          entering={FadeInDown.delay(420).duration(500)}
          style={{
            marginTop: 4,
            alignItems: "center",
            paddingVertical: 14,
            borderRadius: 16,
            borderCurve: "continuous",
            borderWidth: 1,
            borderColor: colors.border,
            borderStyle: "dashed",
          }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
            🚧 Games are coming to mobile soon
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
