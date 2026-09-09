import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PullRefreshScroll } from "@/components/pull-refresh";
import { Skeleton } from "@/components/skeleton";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { SpotifyReconnect } from "@/components/spotify-reconnect";
import { searchArtists } from "@/lib/artist-search";
import { getTopArtists, type ArtistFull } from "@/lib/spotify";
import { useSpotifyEpoch } from "@/lib/spotify-auth";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/type";
import { cardSurface } from "@/theme/surfaces";

// Mirrors the web /app/artists page (top 24 artists, medium_term).
//
// The search box does two things at once: it filters the artists we already
// have, and — from two characters — searches Spotify's whole catalog through
// the `spotify-search` edge function. /v1/search needs the APP token (client
// secret), which can't ship in a bundle, so the function holds it; see
// lib/artist-search.ts. Catalog hits carry real Spotify ids, so a searched
// artist opens the same screen as one of your own.
//
// Layout: your #1 artist gets a full-width poster; the rest is a borderless
// grid where the photos do the work instead of card frames.

function useOpenArtist() {
  const router = useRouter();
  return useCallback(
    (artist: ArtistFull) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({
        pathname: "/artist/[id]",
        // Pass what we already know so the detail header paints instantly
        // (and still shows something if the Spotify token has aged out).
        params: { id: artist.id, name: artist.name, image: artist.image ?? "" },
      });
    },
    [router],
  );
}

/** The #1 artist, as a poster. One thing on this screen should be big. */
function FeatureArtist({ artist }: { artist: ArtistFull }) {
  const open = useOpenArtist();
  const { width } = useWindowDimensions();
  const height = Math.min(width * 0.62, 260);

  return (
    <Animated.View entering={FadeIn.duration(500)}>
      <Pressable
        onPress={() => open(artist)}
        style={({ pressed }) => ({
          height,
          justifyContent: "flex-end",
          overflow: "hidden",
          opacity: pressed ? 0.85 : 1,
        })}>
        {artist.image ? (
          <Image
            source={artist.image}
            style={{ position: "absolute", width: "100%", height: "100%" }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              position: "absolute",
              width: "100%",
              height: "100%",
              backgroundColor: colors.cardElevated,
            }}
          />
        )}
        <LinearGradient
          colors={["rgba(18,18,18,0.2)", "rgba(18,18,18,0.75)", colors.background]}
          locations={[0, 0.65, 1]}
          style={{ position: "absolute", inset: 0 }}
        />
        <View style={{ padding: 20, gap: 3 }}>
          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 1.2,
              textTransform: "uppercase",
            }}>
            Your number one
          </Text>
          <Text
            numberOfLines={1}
            style={{ ...typography.screenTitle, fontSize: 30, color: colors.foreground }}>
            {artist.name}
          </Text>
          {artist.genres[0] ? (
            <Text
              numberOfLines={1}
              style={{ color: colors.mutedForeground, fontSize: 13, textTransform: "capitalize" }}>
              {artist.genres.slice(0, 2).join(" · ")}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** The small uppercase heading over each grid block. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        color: colors.mutedForeground,
        fontSize: 12,
        fontWeight: "600",
        letterSpacing: 0.8,
        textTransform: "uppercase",
        marginBottom: 14,
      }}>
      {children}
    </Text>
  );
}

/** Grid tile: photo first, label underneath, no card frame. */
function ArtistTile({
  artist,
  index,
  size,
}: {
  artist: ArtistFull;
  index: number;
  size: number;
}) {
  const open = useOpenArtist();

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 40).duration(400)}>
      <Pressable
        onPress={() => open(artist)}
        style={({ pressed }) => ({
          width: size,
          gap: 8,
          opacity: pressed ? 0.7 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        })}>
        {artist.image ? (
          <Image
            source={artist.image}
            style={{ width: size, height: size, borderRadius: 14 }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              width: size,
              height: size,
              borderRadius: 14,
              borderCurve: "continuous",
              backgroundColor: colors.cardElevated,
              alignItems: "center",
              justifyContent: "center",
            }}>
            <IconSymbol name="music.mic" size={24} color={colors.mutedForeground} />
          </View>
        )}
        <View style={{ gap: 1 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
            {artist.name}
          </Text>
          {artist.genres[0] ? (
            <Text
              numberOfLines={1}
              style={{ color: colors.mutedForeground, fontSize: 11, textTransform: "capitalize" }}>
              {artist.genres[0]}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function ArtistsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [artists, setArtists] = useState<ArtistFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  // Keyed by the query it answers, so a slow response for an old query can't
  // flash under a newer one — and so "loading" is derivable rather than a
  // second state set synchronously in the effect below.
  const [remote, setRemote] = useState<{ q: string; artists: ArtistFull[] }>({ q: "", artists: [] });

  const epoch = useSpotifyEpoch();
  const load = useCallback(async () => {
    // `ok` is the only failure signal. An empty list is NOT one: a fresh
    // Spotify account has no ranked artists yet, and reading empty as "broken
    // token" showed the error screen to people whose session was fine.
    const { ok, artists: list } = await getTopArtists();
    setArtists(list);
    setFailed(!ok);
  }, []);

  useEffect(() => {
    // Reading `epoch` is what re-runs this when Spotify reconnects, so an empty
    // result from a dead token doesn't stick for the life of the mount.
    void epoch;
    load().finally(() => setLoading(false));
  }, [load, epoch]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  // Catalog search, debounced — every keystroke is an edge-function call and a
  // Spotify request otherwise, and a 429 on this client_id breaks OAuth login.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let alive = true;
    const timer = setTimeout(() => {
      searchArtists(q).then((res) => {
        if (alive) setRemote({ q, artists: res.artists });
      });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return artists;
    return artists.filter(
      (a) => a.name.toLowerCase().includes(q) || a.genres.some((g) => g.toLowerCase().includes(q)),
    );
  }, [artists, query]);

  const trimmed = query.trim();
  const searching = trimmed.length > 0;
  // Results count only while they still answer what's in the box.
  const remoteLoading = trimmed.length >= 2 && remote.q !== trimmed;
  // The same artist arriving from both sources would render twice.
  const localIds = useMemo(() => new Set(artists.map((a) => a.id)), [artists]);
  const remoteOnly = useMemo(
    () => (remote.q === trimmed ? remote.artists.filter((a) => !localIds.has(a.id)) : []),
    [remote, trimmed, localIds],
  );
  // Three columns, 20pt outer padding, 12pt gutters.
  const tileSize = (width - 40 - 24) / 3;
  // The poster only makes sense when we're showing the real ranking.
  const feature = !searching && filtered.length > 0 ? filtered[0] : null;
  const gridArtists = feature ? filtered.slice(1) : filtered;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 8 }}>
        <View style={{ paddingHorizontal: 20, gap: 14, marginBottom: 18 }}>
          <Skeleton width={190} height={32} radius={8} />
          <Skeleton width="100%" height={42} radius={14} />
        </View>
        <Skeleton width="100%" height={Math.min(width * 0.62, 260)} radius={0} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, padding: 20 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={{ gap: 8 }}>
              <Skeleton width={tileSize} height={tileSize} radius={14} />
              <Skeleton width={tileSize * 0.7} height={11} radius={4} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PullRefreshScroll
        refreshing={refreshing}
        onRefresh={onRefresh}
        indicatorTop={insets.top + 8}
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="never"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 32 }}>
        <View style={{ paddingHorizontal: 20, gap: 14, marginBottom: 18 }}>
          <Text
            style={{ ...typography.screenTitle, color: colors.foreground }}>
            Your Artists
          </Text>

          {/* Filter box — matches on artist name or genre */}
          <View
            style={{
              ...cardSurface,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 11,
              borderRadius: 14,
            }}>
            <IconSymbol name="magnifyingglass" size={15} color={colors.mutedForeground} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search any artist"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={{ flex: 1, color: colors.foreground, fontSize: 14, padding: 0 }}
            />
            {query ? (
              <Pressable onPress={() => setQuery("")} hitSlop={10}>
                <IconSymbol name="xmark" size={14} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {failed ? (
          <View style={{ alignItems: "center", gap: 8, paddingVertical: 60, paddingHorizontal: 40 }}>
            <IconSymbol name="music.mic" size={30} color={colors.mutedForeground} />
            <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "600" }}>
              Couldn&apos;t load your artists
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: "center" }}>
              Your Spotify session may have expired. Pull to refresh, or sign out and back in.
            </Text>
            {/* Self-hides unless the connection is genuinely dead. */}
            <View style={{ alignSelf: "stretch", marginTop: 8 }}>
              <SpotifyReconnect />
            </View>
          </View>
        ) : !searching && artists.length === 0 ? (
          <View style={{ alignItems: "center", gap: 8, paddingVertical: 60, paddingHorizontal: 40 }}>
            <IconSymbol name="music.mic" size={30} color={colors.mutedForeground} />
            <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "600" }}>
              No top artists yet
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: "center" }}>
              Spotify needs a few days of listening before it ranks your artists. Keep playing and
              they&apos;ll show up here.
            </Text>
          </View>
        ) : filtered.length === 0 && remoteOnly.length === 0 && !remoteLoading ? (
          <View style={{ alignItems: "center", gap: 8, paddingVertical: 60 }}>
            <IconSymbol name="magnifyingglass" size={28} color={colors.mutedForeground} />
            <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "600" }}>
              No matches
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Try a different name</Text>
          </View>
        ) : (
          <>
            {feature ? <FeatureArtist artist={feature} /> : null}

            {gridArtists.length > 0 ? (
              <View style={{ paddingHorizontal: 20, marginTop: feature ? 22 : 0 }}>
                <SectionLabel>
                  {searching
                    ? `${filtered.length} in your artists`
                    : "The rest of your month"}
                </SectionLabel>

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                  {gridArtists.map((artist, i) => (
                    <ArtistTile key={artist.id} artist={artist} index={i} size={tileSize} />
                  ))}
                </View>
              </View>
            ) : null}

            {/* Catalog results — artists you've never played. Shown second:
                what you listen to is the more likely target of a search. */}
            {searching ? (
              <View
                style={{
                  paddingHorizontal: 20,
                  marginTop: gridArtists.length > 0 ? 28 : 0,
                }}>
                <SectionLabel>
                  {remoteLoading && remoteOnly.length === 0 ? "Searching Spotify…" : "More on Spotify"}
                </SectionLabel>

                {remoteOnly.length > 0 ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                    {remoteOnly.map((artist, i) => (
                      <ArtistTile key={artist.id} artist={artist} index={i} size={tileSize} />
                    ))}
                  </View>
                ) : remoteLoading ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <View key={i} style={{ gap: 8 }}>
                        <Skeleton width={tileSize} height={tileSize} radius={14} />
                        <Skeleton width={tileSize * 0.7} height={11} radius={4} />
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                    Nothing else on Spotify for that.
                  </Text>
                )}
              </View>
            ) : null}
          </>
        )}
      </PullRefreshScroll>
    </View>
  );
}
