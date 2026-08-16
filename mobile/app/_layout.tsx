import {
  Manrope_600SemiBold,
  Manrope_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/manrope";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { SessionProvider, useSession } from "@/lib/auth";
import { NowPlayingProvider } from "@/lib/now-playing";
import { colors } from "@/theme/colors";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  // Display face for headings and figures; body text stays on the OS font.
  const [fontsLoaded] = useFonts({ Manrope_600SemiBold, Manrope_800ExtraBold });

  // Hold the splash rather than flash unstyled text — the splash is the same
  // #121212 as the app, so this reads as one continuous launch.
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    // Required by react-native-gesture-handler, which drives the custom
    // pull-to-refresh (components/pull-refresh.tsx).
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SessionProvider>
        <NowPlayingProvider>
          <RootNavigator />
          <StatusBar style="light" />
        </NowPlayingProvider>
      </SessionProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="artist/[id]" options={{ animation: "slide_from_right" }} />
      </Stack.Protected>
    </Stack>
  );
}
