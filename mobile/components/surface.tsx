import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { cardSurface, raisedSurface, softShadow } from "@/theme/surfaces";

type Props = {
  children: ReactNode;
  /** Outer style — use for margins / width / flex. */
  style?: StyleProp<ViewStyle>;
  /** Inner style — use for padding / alignment of the content. */
  contentStyle?: StyleProp<ViewStyle>;
  radius?: number;
  /** 1 = a card on the page, 2 = a tile sitting on a card (one tone lighter). */
  level?: 1 | 2;
  /** Soft crimson drop shadow. Turn off inside dense lists — stacked shadows muddy. */
  glow?: boolean;
};

/**
 * The app's standard surface. Replaces the old frosted-glass card: no BlurView,
 * no sheen, no rim — depth is carried by tone plus a soft tinted shadow. See
 * theme/surfaces.ts for the elevation ramp and why.
 *
 * Opaque surfaces also cost far less to render than a BlurView, which was the
 * most expensive thing on the profile screen.
 */
export function Surface({
  children,
  style,
  contentStyle,
  radius,
  level = 1,
  glow = true,
}: Props) {
  const base = level === 2 ? raisedSurface : cardSurface;
  return (
    <View
      style={[
        base,
        glow && level === 1 ? softShadow : null,
        radius !== undefined ? { borderRadius: radius } : null,
        style,
      ]}>
      <View style={[{ overflow: "hidden", borderRadius: radius ?? base.borderRadius }, contentStyle]}>
        {children}
      </View>
    </View>
  );
}
