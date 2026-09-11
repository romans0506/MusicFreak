import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSession } from "@/lib/auth";
import { colors } from "@/theme/colors";

export default function LoginScreen() {
  const { signIn } = useSession();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  // Failures used to go to console.warn only, so a user stuck on this screen saw
  // nothing at all and had no way to tell us what went wrong.
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    try {
      setBusy(true);
      setError(null);
      await signIn();
    } catch (e) {
      console.warn("Sign-in failed", e);
      setError(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    // Flat ground, no gradient — the wordmark's text-shadow carries the screen.
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: 28,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 28,
          justifyContent: "space-between",
        }}>
        {/* Wordmark block, vertically centered in the upper area */}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
          <Animated.Text
            entering={FadeInDown.delay(80).duration(600)}
            style={{
              fontSize: 58,
              fontWeight: "900",
              letterSpacing: -2.5,
              textShadowColor: "rgba(224,25,53,0.55)",
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 24,
            }}>
            <Text style={{ color: colors.foreground }}>Music</Text>
            <Text style={{ color: "#ff2d45" }}>Freak</Text>
          </Animated.Text>

          <Animated.Text
            entering={FadeInDown.delay(220).duration(600)}
            style={{
              color: colors.mutedForeground,
              fontSize: 16,
              textAlign: "center",
              maxWidth: 300,
              lineHeight: 23,
            }}>
            Why wait for Wrapped?
          </Animated.Text>
        </View>

        {/* Sign-in action pinned near the bottom */}
        <Animated.View entering={FadeInDown.delay(360).duration(600)} style={{ gap: 16 }}>
          <Pressable
            onPress={handleSignIn}
            disabled={busy}
            style={({ pressed }) => ({
              transform: [{ scale: pressed ? 0.96 : 1 }],
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              paddingVertical: 17,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              opacity: busy ? 0.7 : 1,
            })}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 16 }}>
                Continue with Spotify
              </Text>
            )}
          </Pressable>

          {error ? (
            <Animated.Text
              entering={FadeIn}
              style={{
                color: "#ffb4b4",
                fontSize: 13,
                textAlign: "center",
                lineHeight: 18,
              }}>
              {error}
            </Animated.Text>
          ) : null}

          <Animated.Text
            entering={FadeIn.delay(600)}
            style={{
              color: "rgba(255,255,255,0.4)",
              fontSize: 12,
              textAlign: "center",
            }}>
            We only use Spotify to personalize your stats
          </Animated.Text>
        </Animated.View>
      </View>
    </View>
  );
}
