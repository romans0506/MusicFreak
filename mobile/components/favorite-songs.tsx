import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";

import { GlassCard } from "@/components/glass-card";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/colors";

type FavoriteSong = {
  id: string;
  track_id: string;
  name: string;
  artists: string;
  album_art: string | null;
};

export default function FavoriteSongs({ userId }: { userId: string }) {
  const [favorites, setFavorites] = useState<FavoriteSong[] | null>(null);

  useEffect(() => {
    supabase
      .from("favorite_songs")
      .select("id, track_id, name, artists, album_art")
      .eq("user_id", userId)
      .order("added_at", { ascending: false })
      .then(({ data }) => setFavorites((data ?? []) as FavoriteSong[]));
  }, [userId]);

  async function remove(fav: FavoriteSong) {
    setFavorites((prev) => prev?.filter((f) => f.id !== fav.id) ?? null);
    const { error } = await supabase.from("favorite_songs").delete().eq("id", fav.id);
    if (error) {
      // put it back if the delete failed
      setFavorites((prev) => (prev ? [fav, ...prev] : [fav]));
    }
  }

  function confirmRemove(fav: FavoriteSong) {
    Alert.alert("Remove favorite", `Remove "${fav.name}" from your favorites?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => remove(fav) },
    ]);
  }

  // Hide the whole section until we know there's something to show — keeps the
  // profile clean for users who haven't favorited anything (they add songs on
  // the web app, where Spotify catalog search is available).
  if (!favorites || favorites.length === 0) return null;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 16 }}>❤️</Text>
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
          Favorite Songs
        </Text>
      </View>
      <GlassCard radius={22}>
        {favorites.map((f, i) => (
          <Pressable
            key={f.id}
            onPress={() => f.track_id && Linking.openURL(`https://open.spotify.com/track/${f.track_id}`).catch(() => {})}
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
              <Image source={f.album_art} style={{ width: 40, height: 40, borderRadius: 8 }} contentFit="cover" />
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
                <Text style={{ fontSize: 16 }}>🎵</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
                {f.name}
              </Text>
              <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 12 }}>
                {f.artists}
              </Text>
            </View>
            <Pressable onPress={() => confirmRemove(f)} hitSlop={10}>
              <Text style={{ fontSize: 16 }}>❤️</Text>
            </Pressable>
          </Pressable>
        ))}
      </GlassCard>
      <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
        Long-press a song to remove it. Add favorites on the web app.
      </Text>
    </View>
  );
}
