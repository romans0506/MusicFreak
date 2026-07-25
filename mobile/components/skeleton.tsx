import { useEffect } from "react";
import { View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  useReducedMotion,
} from "react-native-reanimated";

import { colors } from "@/theme/colors";

/**
 * A single placeholder block.
 *
 * Skeletons beat spinners because they promise a shape: the eye settles on the
 * layout before the data lands, so the screen doesn't jump when it does. Keep
 * each skeleton the same size as the thing it stands in for.
 *
 * The shimmer runs entirely on the UI thread (reanimated) and collapses to a
 * static block when the OS asks for reduced motion.
 */
export function Skeleton({
  width = "100%",
  height,
  radius = 8,
  style,
}: {
  width?: DimensionValue;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useSharedValue(0.5);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1, // forever
      true, // reverse — a breathe, not a sawtooth
    );
  }, [pulse, reduceMotion]);

  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          borderCurve: "continuous",
          backgroundColor: colors.cardElevated,
        },
        reduceMotion ? { opacity: 0.6 } : animated,
        style,
      ]}
    />
  );
}

/** Placeholder for a track/leader row: rank, artwork, two lines of text. */
export function SkeletonRow({ artworkRadius = 8 }: { artworkRadius?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
      <Skeleton width={16} height={12} radius={4} />
      <Skeleton width={46} height={46} radius={artworkRadius} />
      <View style={{ flex: 1, gap: 7 }}>
        <Skeleton width="62%" height={12} radius={4} />
        <Skeleton width="38%" height={10} radius={4} />
      </View>
    </View>
  );
}

/** Placeholder for the art-led hero: full-bleed block plus the number under it. */
export function SkeletonHero({ height }: { height: number }) {
  return (
    <View style={{ height, justifyContent: "flex-end" }}>
      <Skeleton
        width="100%"
        height={height}
        radius={0}
        style={{ position: "absolute", opacity: 0.5 }}
      />
      <View style={{ paddingHorizontal: 20, paddingBottom: 24, gap: 10 }}>
        <Skeleton width={90} height={11} radius={4} />
        <Skeleton width={210} height={52} radius={10} />
        <Skeleton width={170} height={12} radius={4} />
      </View>
    </View>
  );
}
