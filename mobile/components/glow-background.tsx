import { View } from "react-native";

import { colors } from "@/theme/colors";

// The crimson blurred-blob motif reused across the web app (hero, /app layout,
// profile). RN has no cheap large-radius blur, so we fake it with big, very
// low-opacity primary circles — subtle depth without a perf hit. Render this as
// the first child of a screen's root View (absolute, non-interactive).
export function GlowBackground() {
  return (
    <View pointerEvents="none" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <View
        style={{
          position: "absolute",
          top: -160,
          left: -140,
          width: 420,
          height: 420,
          borderRadius: 999,
          backgroundColor: colors.primary,
          opacity: 0.12,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 220,
          right: -180,
          width: 460,
          height: 460,
          borderRadius: 999,
          backgroundColor: colors.primary,
          opacity: 0.08,
        }}
      />
    </View>
  );
}
