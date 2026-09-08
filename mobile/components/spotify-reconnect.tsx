import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn } from "react-native-reanimated";

import { Surface } from "@/components/surface";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useSession } from "@/lib/auth";
import { useSpotifyConnection } from "@/lib/spotify-auth";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/type";

/**
 * Shown only when the Spotify connection is genuinely dead — that is, when
 * Spotify rejected our refresh token with `invalid_grant`, which happens if the
 * user revokes MusicFreak in their Spotify account settings, or if they signed
 * in before this app had a PKCE connection of its own.
 *
 * It should be rare. The point of lib/spotify-auth.ts is that an ordinary
 * session no longer expires, so this is the exception path, not the norm — it
 * deliberately does not appear for a failed request or an offline phone, which
 * would nag people about something a tap can't fix.
 *
 * Reconnecting re-runs only the Spotify half of sign-in. The Supabase session,
 * and everything that hangs off it, is untouched.
 */
export function SpotifyReconnect() {
  const connected = useSpotifyConnection();
  const { reconnectSpotify } = useSession();
  const [busy, setBusy] = useState(false);

  if (connected !== false) return null;

  async function reconnect() {
    if (busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    try {
      await reconnectSpotify();
    } catch {
      /* the row simply stays until it works */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <Pressable
        onPress={reconnect}
        disabled={busy}
        style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}>
        <Surface
          radius={18}
          glow={false}
          contentStyle={{
            paddingVertical: 15,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              borderCurve: "continuous",
              backgroundColor: colors.primarySoft,
              alignItems: "center",
              justifyContent: "center",
            }}>
            <IconSymbol name="dot.radiowaves.left.and.right" size={19} color={colors.primary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ ...typography.section, color: colors.foreground }}>
              Reconnect Spotify
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 18 }}>
              Your listening data is paused until you do.
            </Text>
          </View>
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <IconSymbol name="chevron.right" size={18} color={colors.mutedForeground} />
          )}
        </Surface>
      </Pressable>
    </Animated.View>
  );
}
