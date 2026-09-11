import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { toggleFavoriteSong, useFavoriteSongs } from "@/lib/favorites";
import { getFavoritableTracks, type CatalogTrack } from "@/lib/spotify";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/type";

/**
 * Pick songs to favourite.
 *
 * The web app searches Spotify's catalogue here. The device can't — /v1/search
 * needs the app token — so this offers everything Spotify will tell us about
 * your own listening instead: recently played plus your top tracks across all
 * three ranges (see getFavoritableTracks). The filter box searches that pool
 * rather than the catalogue, which is why it says "your listening" and not
 * "Spotify": promising a catalogue search we can't perform would be worse than
 * the limitation itself.
 *
 * Toggling is instant — the store updates optimistically — so this stays a
 * tap-tap-tap sheet rather than one that blocks per row.
 */
export function AddFavoriteSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [pool, setPool] = useState<CatalogTrack[] | null>(null);
  const [query, setQuery] = useState("");
  const favorites = useFavoriteSongs();

  // Fetch when the sheet opens, not on mount — four Spotify calls shouldn't run
  // for everyone who visits their profile.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    getFavoritableTracks().then((tracks) => {
      if (!cancelled) setPool(tracks);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const favoriteIds = useMemo(
    () => new Set((favorites ?? []).map((f) => f.track_id)),
    [favorites],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !pool) return pool ?? [];
    return pool.filter(
      (t) => t.name.toLowerCase().includes(q) || t.artists.toLowerCase().includes(q),
    );
  }, [pool, query]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingTop: 18,
            paddingBottom: 12,
          }}>
          <Text style={{ ...typography.section, fontSize: 19, color: colors.foreground }}>
            Add favourites
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "600" }}>Done</Text>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 20 }}>
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
              height: 44,
            }}>
            <IconSymbol name="magnifyingglass" size={18} color={colors.mutedForeground} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Filter your listening…"
              placeholderTextColor={colors.mutedForeground}
              autoCorrect={false}
              style={{ flex: 1, color: colors.foreground, fontSize: 15 }}
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery("")} hitSlop={10}>
                <IconSymbol name="xmark" size={16} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
          </View>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 10 }}>
            Songs you have listened to recently or played the most.
          </Text>
        </View>

        {pool === null ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : filtered.length === 0 ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              paddingHorizontal: 40,
            }}>
            <IconSymbol name="music.note" size={30} color={colors.mutedForeground} />
            <Text
              style={{
                color: colors.mutedForeground,
                fontSize: 14,
                textAlign: "center",
                lineHeight: 20,
              }}>
              {pool.length === 0
                ? "We could not reach Spotify for your listening history. Check the connection on your profile and try again."
                : "Nothing matches that."}
            </Text>
          </View>
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16 }}>
            {filtered.map((track) => {
              const isFavorite = favoriteIds.has(track.id);
              return (
                <Pressable
                  key={track.id}
                  onPress={() => {
                    Haptics.impactAsync(
                      isFavorite
                        ? Haptics.ImpactFeedbackStyle.Light
                        : Haptics.ImpactFeedbackStyle.Medium,
                    );
                    toggleFavoriteSong(track);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 9,
                    opacity: pressed ? 0.6 : 1,
                  })}>
                  {track.albumArt ? (
                    <Image
                      source={{ uri: track.albumArt }}
                      style={{ width: 46, height: 46, borderRadius: 8 }}
                      contentFit="cover"
                      transition={150}
                    />
                  ) : (
                    <View
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 8,
                        backgroundColor: colors.cardElevated,
                        alignItems: "center",
                        justifyContent: "center",
                      }}>
                      <IconSymbol name="music.note" size={16} color={colors.mutedForeground} />
                    </View>
                  )}

                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      numberOfLines={1}
                      style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
                      {track.name}
                    </Text>
                    <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 12 }}>
                      {track.artists}
                    </Text>
                  </View>

                  <IconSymbol
                    name={isFavorite ? "heart.fill" : "heart"}
                    size={20}
                    color={isFavorite ? colors.primary : colors.mutedForeground}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
