import { useEffect } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useNowPlaying } from "@/lib/now-playing";
import { colors } from "@/theme/colors";

/** Three bars bouncing in the Spotify green — the only looping motion in the app. */
function LevelMeter() {
  const reduceMotion = useReducedMotion();
  const a = useSharedValue(0.35);
  const b = useSharedValue(1);
  const c = useSharedValue(0.6);

  useEffect(() => {
    if (reduceMotion) return;
    const run = (v: typeof a, duration: number) => {
      v.value = withRepeat(
        withTiming(v.value > 0.6 ? 0.3 : 1, { duration, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
    };
    // Slightly different periods so the bars never move in lockstep.
    run(a, 420);
    run(b, 560);
    run(c, 340);
  }, [a, b, c, reduceMotion]);

  // Three separate calls rather than a loop — hooks must not run conditionally
  // or inside a helper.
  const styleA = useAnimatedStyle(() => ({ transform: [{ scaleY: a.value }] }));
  const styleB = useAnimatedStyle(() => ({ transform: [{ scaleY: b.value }] }));
  const styleC = useAnimatedStyle(() => ({ transform: [{ scaleY: c.value }] }));
  const styles = [styleA, styleB, styleC];

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2, height: 14 }}>
      {styles.map((style, i) => (
        <Animated.View
          key={i}
          style={[
            { width: 2.5, height: 14, borderRadius: 2, backgroundColor: colors.spotify },
            reduceMotion ? null : style,
          ]}
        />
      ))}
    </View>
  );
}

/**
 * The bar above the tab bar showing what's playing on Spotify right now.
 *
 * Renders nothing when nothing is playing, so it never occupies space it hasn't
 * earned. Data comes from the shared NowPlaying poller, not its own fetch.
 */
export function MiniPlayer() {
  const now = useNowPlaying();

  if (!now?.playing || !now.track) return null;
  const track = now.track;

  return (
    <Animated.View entering={FadeInDown.duration(260)} exiting={FadeOutDown.duration(200)}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          Linking.openURL(`https://open.spotify.com/track/${track.id}`);
        }}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 14,
          paddingVertical: 9,
          backgroundColor: pressed ? colors.cardElevated : colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        })}>
        {track.albumArt ? (
          <Image
            source={track.albumArt}
            style={{ width: 40, height: 40, borderRadius: 7 }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 7,
              backgroundColor: colors.cardElevated,
              alignItems: "center",
              justifyContent: "center",
            }}>
            <IconSymbol name="music.note" size={15} color={colors.mutedForeground} />
          </View>
        )}

        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
            {track.name}
          </Text>
          <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 11 }}>
            {track.artists}
          </Text>
        </View>

        <LevelMeter />
      </Pressable>
    </Animated.View>
  );
}
