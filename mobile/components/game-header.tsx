import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { colors } from "@/theme/colors";

/**
 * The top bar every game screen wears: a back affordance, plus whatever the
 * current state wants beside it (the round HUD, usually nothing).
 *
 * Game screens are pushed over the tabs and are headerShown: false like the
 * rest of the app, so this is the only way out of a round — which is why it
 * stays put through every state instead of only the ones with a header.
 */
export function GameHeader({ onBack, right }: { onBack: () => void; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 20,
        paddingBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onBack();
        }}
        hitSlop={12}
        style={({ pressed }) => ({
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? colors.cardPressed : colors.card,
          borderWidth: 1,
          borderColor: colors.border,
        })}>
        <IconSymbol name="chevron.left" size={20} color={colors.foreground} />
      </Pressable>
      <View style={{ flex: 1 }}>{right}</View>
    </View>
  );
}
