import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

import { colors } from "@/theme/colors";

type Props = {
  children: ReactNode;
  /** Outer style — use for margins / width. */
  style?: StyleProp<ViewStyle>;
  /** Inner style — use for padding / alignment of the content. */
  contentStyle?: StyleProp<ViewStyle>;
  radius?: number;
  intensity?: number;
  /** Crimson drop-glow under the card for depth. */
  glow?: boolean;
};

// Bubbly frosted-glass surface: a dark BlurView frosts the crimson glow behind
// it, a top-left white sheen + a bright rim sell the "glass", and a tinted
// shadow lifts it off the page. Reused for every profile section.
export function GlassCard({
  children,
  style,
  contentStyle,
  radius = 24,
  intensity = 26,
  glow = true,
}: Props) {
  return (
    <View style={[glow && styles.glow, { borderRadius: radius }, style]}>
      <BlurView
        intensity={intensity}
        tint="dark"
        style={{
          borderRadius: radius,
          borderCurve: "continuous",
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.14)",
          backgroundColor: "rgba(28,28,30,0.45)",
        }}>
        {/* diagonal sheen */}
        <LinearGradient
          colors={["rgba(255,255,255,0.13)", "rgba(255,255,255,0.03)", "rgba(255,255,255,0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={contentStyle}>{children}</View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
});
