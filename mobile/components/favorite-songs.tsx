import { useState } from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";

import { AddFavoriteSheet } from "@/components/add-favorite-sheet";
import { Surface } from "@/components/surface";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { toggleFavoriteSong, useFavoriteSongs, type FavoriteSong } from "@/lib/favorites";
import { colors } from "@/theme/colors";

/**
 * Favourite songs on the profile.
 *
 * This used to be read-only, with a line telling you to add favourites on the
 * web app — the device had no way in, because the web flow favourites out of
 * Spotify's catalogue search and /v1/search needs the app token. AddFavoriteSheet
 * closes that: it offers your own listening (recently played + top tracks)
 * instead of the catalogue, which still yields real Spotify ids, so favourites
 * made here are indistinguishable from ones made on the web.
 *
 * The section now renders even when empty, since an empty state with an Add
 * button is the only way anyone discovers the feature exists.
 */
export default function FavoriteSongs() {
  const favorites = useFavoriteSongs();
  const [adding, setAdding] = useState(false);

  function confirmRemove(fav: FavoriteSong) {
    Alert.alert("Remove favourite", `Remove "${fav.name}" from your favourites?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          toggleFavoriteSong({
            id: fav.track_id,
            name: fav.name,
            artists: fav.artists,
            albumArt: fav.album_art,
            artistIds: [],
          }),
      },
    ]);
  }

  // Still loading — say nothing rather than flash an empty state.
  if (favorites === null) return null;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <IconSymbol name="heart.fill" size={16} color={colors.primary} />
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700", flex: 1 }}>
          Favorite Songs
        </Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setAdding(true);
          }}
          hitSlop={10}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            opacity: pressed ? 0.6 : 1,
          })}>
          <IconSymbol name="plus" size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "600" }}>Add</Text>
        </Pressable>
      </View>

      {favorites.length === 0 ? (
        <Surface radius={22} contentStyle={{ paddingVertical: 26, paddingHorizontal: 20, alignItems: "center", gap: 6 }}>
          <IconSymbol name="heart" size={24} color={colors.mutedForeground} />
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
            No favourites yet
          </Text>
          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: 12,
              textAlign: "center",
              lineHeight: 17,
            }}>
            Tap Add to pick from the songs you have been listening to.
          </Text>
        </Surface>
      ) : (
        <>
          <Surface radius={22}>
            {favorites.map((f, i) => (
              <Pressable
                key={f.id}
                onPress={() =>
                  f.track_id &&
                  Linking.openURL(`https://open.spotify.com/track/${f.track_id}`).catch(() => {})
                }
                onLongPress={() => confirmRemove(f)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                  borderBottomWidth: i < favorites.length - 1 ? 1 : 0,
                  borderBottomColor: colors.border,
                }}>
                {f.album_art ? (
                  <Image
                    source={f.album_art}
                    style={{ width: 40, height: 40, borderRadius: 8 }}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      backgroundColor: colors.cardElevated,
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                    <IconSymbol name="music.note" size={16} color={colors.mutedForeground} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
                    {f.name}
                  </Text>
                  <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 12 }}>
                    {f.artists}
                  </Text>
                </View>
                <Pressable onPress={() => confirmRemove(f)} hitSlop={10}>
                  <IconSymbol name="heart.fill" size={16} color={colors.primary} />
                </Pressable>
              </Pressable>
            ))}
          </Surface>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
            Tap the heart, or long-press a row, to remove.
          </Text>
        </>
      )}

      <AddFavoriteSheet visible={adding} onClose={() => setAdding(false)} />
    </View>
  );
}
