import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn } from "react-native-reanimated";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { artistArtwork, searchItunesArtists } from "@/lib/itunes";
import { type GameArtist } from "@/lib/games";
import { getTopArtistsFull } from "@/lib/spotify";
import { colors, scrim } from "@/theme/colors";
import { typography } from "@/theme/type";

/**
 * Pick an artist to play against. Used by Name That Song and by Lyric → Song's
 * "By Artist" mode — the mobile counterpart of the web ArtistPicker.
 *
 * The web picker searches Spotify. The device can't: /v1/search needs the app
 * token (see CLAUDE.md), which is why the Artists tab only filters your own top
 * artists. Here that would be too small a world — half the point of these games
 * is playing an artist you *don't* listen to — so search goes to iTunes, which
 * is keyless and is already the catalogue both games draw their songs from.
 * Searching the same source that has to supply the round also means a result
 * you can pick is a round we can actually build.
 *
 * The trade-off is the picture. iTunes publishes no artist portraits, so:
 *   - your own top artists keep their real Spotify photo (and their Spotify id,
 *     which is what a per-artist leaderboard is keyed on)
 *   - a searched artist falls back to their latest album cover, fetched lazily
 *     on pick — one request, rather than one per row per keystroke.
 */

const DEBOUNCE_MS = 350;
const MIN_QUERY = 2;

type Row = { key: string; name: string; image: string | null; spotifyId: string | null };

function Avatar({ name, image, size }: { name: string; image: string | null; size: number }) {
  if (image) {
    return (
      <Image
        source={{ uri: image }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        transition={200}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.cardElevated,
        alignItems: "center",
        justifyContent: "center",
      }}>
      <Text style={{ ...typography.figure, color: colors.mutedForeground }}>
        {name[0]?.toUpperCase()}
      </Text>
    </View>
  );
}

export function ArtistPicker({ onPick }: { onPick: (artist: GameArtist) => void }) {
  const [top, setTop] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  /** Last completed search, tagged with the query it answers. */
  const [results, setResults] = useState<{ query: string; rows: Row[] } | null>(null);
  const [loadingTop, setLoadingTop] = useState(true);
  /** Name of the row whose artwork we're resolving, so it can show a spinner. */
  const [picking, setPicking] = useState<string | null>(null);

  const trimmed = query.trim();
  const searchMode = trimmed.length >= MIN_QUERY;
  // Tagging the results with their query means "are we still searching?" is a
  // comparison, not another piece of state to keep in step with this one.
  const fresh = results?.query === trimmed ? results.rows : null;
  const searching = searchMode && fresh === null;

  // Your own top artists — the quick-pick list, and the only rows that carry a
  // Spotify id. Empty if Spotify is unreachable; iTunes search still works.
  useEffect(() => {
    let cancelled = false;
    getTopArtistsFull(24)
      .then((artists) => {
        if (cancelled) return;
        setTop(
          artists.map((a) => ({
            key: a.id,
            name: a.name,
            image: a.image ?? null,
            spotifyId: a.id,
          })),
        );
      })
      .finally(() => !cancelled && setLoadingTop(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced iTunes search.
  useEffect(() => {
    if (!searchMode) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const found = await searchItunesArtists(trimmed);
      if (cancelled) return;
      setResults({
        query: trimmed,
        rows: found.map((a) => ({
          key: String(a.id),
          name: a.name,
          image: null,
          spotifyId: null,
        })),
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [trimmed, searchMode]);

  const list = useMemo(() => (searchMode ? (fresh ?? []) : top), [searchMode, fresh, top]);

  async function pick(row: Row) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // A Spotify row already has the better picture; only searched rows need one.
    if (row.image || row.spotifyId) {
      onPick({ name: row.name, image: row.image, spotifyId: row.spotifyId });
      return;
    }
    setPicking(row.key);
    const art = await artistArtwork(Number(row.key)).catch(() => null);
    setPicking(null);
    onPick({ name: row.name, image: art, spotifyId: null });
  }

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 999,
          paddingHorizontal: 16,
          height: 46,
          marginBottom: 20,
        }}>
        <IconSymbol name="magnifyingglass" size={18} color={colors.mutedForeground} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search for an artist…"
          placeholderTextColor={colors.mutedForeground}
          autoCorrect={false}
          returnKeyType="search"
          style={{ flex: 1, color: colors.foreground, fontSize: 15 }}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery("")} hitSlop={10}>
            <IconSymbol name="xmark" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      <Text style={{ ...typography.eyebrow, color: colors.mutedForeground, marginBottom: 14 }}>
        {searchMode ? "Results" : "Your top artists"}
      </Text>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {list.map((row) => (
            <Animated.View key={row.key} entering={FadeIn.duration(220)} style={{ width: "31%" }}>
              <Pressable
                onPress={() => pick(row)}
                disabled={picking !== null}
                style={({ pressed }) => ({
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 12,
                  borderRadius: 18,
                  borderCurve: "continuous",
                  backgroundColor: pressed ? colors.card : "transparent",
                  opacity: picking && picking !== row.key ? 0.4 : 1,
                })}>
                <View>
                  <Avatar name={row.name} image={row.image} size={78} />
                  {picking === row.key ? (
                    <View
                      style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: 39,
                        backgroundColor: scrim(0.6),
                        alignItems: "center",
                        justifyContent: "center",
                      }}>
                      <ActivityIndicator color={colors.primary} />
                    </View>
                  ) : null}
                </View>
                <Text
                  numberOfLines={2}
                  style={{
                    color: colors.foreground,
                    fontSize: 13,
                    fontWeight: "600",
                    textAlign: "center",
                  }}>
                  {row.name}
                </Text>
              </Pressable>
            </Animated.View>
          ))}
        </View>

        {list.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
            {searching || (!searchMode && loadingTop) ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <IconSymbol name="music.mic" size={30} color={colors.mutedForeground} />
                <Text
                  style={{
                    color: colors.mutedForeground,
                    fontSize: 14,
                    textAlign: "center",
                    lineHeight: 20,
                  }}>
                  {searchMode
                    ? "No artists found. Try a different spelling."
                    : "We don't have your top artists yet — search for anyone above."}
                </Text>
              </>
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
