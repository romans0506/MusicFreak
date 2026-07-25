import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";

import { GlowBackground } from "@/components/glow-background";
import { getTopArtistsFull, type ArtistFull } from "@/lib/spotify";
import { colors } from "@/theme/colors";
import { cardSurface, softShadow } from "@/theme/surfaces";

// Mirrors the web /app/artists page (top 24 artists, medium_term).
//
// Deliberate deviation: the web version's search box hits /api/spotify/search,
// which needs an APP token (client secret) — that can't ship in the app, and a
// user token gets a 400/403 from /v1/search. So the box filters the artists we
// already have instead of searching Spotify's catalog, and says so.

function ArtistCard({ artist, index }: { artist: ArtistFull; index: number }) {
  const router = useRouter();
  const topGenre = artist.genres?.[0];

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 10) * 40).duration(400)}
      style={{ width: "47.5%", flexGrow: 1 }}>
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/artist/[id]",
            // Pass what we already know so the detail header paints instantly
            // (and still shows something if the Spotify token has aged out).
            params: { id: artist.id, name: artist.name, image: artist.image ?? "" },
          })
        }
        style={({ pressed }) => ({
          ...cardSurface,
          ...softShadow,
          alignItems: "center",
          gap: 12,
          padding: 16,
          backgroundColor: pressed ? colors.cardElevated : colors.card,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        })}>
        {artist.image ? (
          <Image
            source={artist.image}
            style={{ width: 84, height: 84, borderRadius: 999 }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 999,
              backgroundColor: colors.cardElevated,
              alignItems: "center",
              justifyContent: "center",
            }}>
            <Text style={{ fontSize: 26, opacity: 0.4 }}>🎤</Text>
          </View>
        )}
        <View style={{ width: "100%", alignItems: "center", gap: 2 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.foreground, fontSize: 14, fontWeight: "700" }}>
            {artist.name}
          </Text>
          {topGenre ? (
            <Text
              numberOfLines={1}
              style={{ color: colors.mutedForeground, fontSize: 12, textTransform: "capitalize" }}>
              {topGenre}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function ArtistsScreen() {
  const [artists, setArtists] = useState<ArtistFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const list = await getTopArtistsFull();
    setArtists(list);
    // An empty list here almost always means the Spotify token aged out, since
    // anyone signed in via Spotify has top artists.
    setFailed(list.length === 0);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return artists;
    return artists.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.genres.some((g) => g.toLowerCase().includes(q)),
    );
  }, [artists, query]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlowBackground />
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: 20, gap: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.mutedForeground}
          />
        }>
        <Animated.View entering={FadeInDown.duration(500)} style={{ gap: 6 }}>
          <Text
            style={{
              color: colors.foreground,
              fontSize: 34,
              fontWeight: "800",
              letterSpacing: -0.5,
            }}>
            Your Artists
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 15 }}>
            Your top artists on Spotify this month.
          </Text>
        </Animated.View>

        {/* Filter box — matches on artist name or genre */}
        <View
          style={{
            ...cardSurface,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 14,
            paddingVertical: 11,
            borderRadius: 16,
          }}>
          <Text style={{ fontSize: 14, opacity: 0.6 }}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Filter your artists by name or genre…"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{ flex: 1, color: colors.foreground, fontSize: 14, padding: 0 }}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <Text style={{ color: colors.mutedForeground, fontSize: 16 }}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        {loading ? (
          <View style={{ paddingVertical: 80, alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : failed ? (
          <View
            style={{
              alignItems: "center",
              ...cardSurface,
              gap: 8,
              paddingVertical: 60,
              paddingHorizontal: 24,
            }}>
            <Text style={{ fontSize: 32 }}>🎤</Text>
            <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "600" }}>
              Couldn&apos;t load your artists
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: "center" }}>
              Your Spotify session may have expired. Pull to refresh, or sign out and back in.
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <View
            style={{
              ...cardSurface,
              alignItems: "center",
              gap: 8,
              paddingVertical: 60,
            }}>
            <Text style={{ fontSize: 32 }}>🔍</Text>
            <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "600" }}>
              No matches
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Try a different name</Text>
          </View>
        ) : (
          <>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              {query.trim()
                ? `${filtered.length} match${filtered.length === 1 ? "" : "es"} for “${query.trim()}”`
                : "Your top artists this month"}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {filtered.map((artist, i) => (
                <ArtistCard key={artist.id} artist={artist} index={i} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
