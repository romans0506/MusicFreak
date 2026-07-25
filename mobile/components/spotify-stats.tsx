import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import Animated, { FadeIn } from "react-native-reanimated";

import { Surface } from "@/components/surface";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  getRecentlyPlayed,
  getTopStats,
  type RecentTrack,
  type TopStats,
} from "@/lib/spotify";
import { useNowPlaying } from "@/lib/now-playing";
import { colors } from "@/theme/colors";

function openSpotify(kind: "track" | "album", id?: string) {
  if (!id) return;
  Linking.openURL(`https://open.spotify.com/${kind}/${id}`).catch(() => {});
}

function formatPlayed(playedAt: string) {
  const then = new Date(playedAt);
  const diffMin = Math.floor((Date.now() - then.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (then.toDateString() === new Date().toDateString()) return `${Math.floor(diffMin / 60)}h ago`;
  return then.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
}

type SymbolName = Parameters<typeof IconSymbol>[0]["name"];

function SectionTitle({ icon, title }: { icon: SymbolName; title: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <IconSymbol name={icon} size={16} color={colors.primary} />
      <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>{title}</Text>
    </View>
  );
}


function Thumb({ uri, round, fallback }: { uri?: string; round?: boolean; fallback: SymbolName }) {
  const radius = round ? 999 : 8;
  if (uri) {
    return (
      <Image source={uri} style={{ width: 38, height: 38, borderRadius: radius }} contentFit="cover" />
    );
  }
  return (
    <View
      style={{
        width: 38,
        height: 38,
        borderRadius: radius,
        backgroundColor: colors.cardElevated,
        alignItems: "center",
        justifyContent: "center",
      }}>
      <IconSymbol name={fallback} size={16} color={colors.mutedForeground} />
    </View>
  );
}

const RECENT_PREVIEW = 4;

export default function SpotifyStats() {
  // Shared poller — see lib/now-playing.tsx for why this is not fetched here.
  const now = useNowPlaying();
  const [recent, setRecent] = useState<RecentTrack[] | null>(null);
  const [stats, setStats] = useState<TopStats | null>(null);
  const [showAllRecent, setShowAllRecent] = useState(false);

  useEffect(() => {
    getRecentlyPlayed().then(setRecent);
    getTopStats().then(setStats);
  }, []);

  const hasAnything =
    now?.playing ||
    (recent && recent.length > 0) ||
    (stats && (stats.topArtists.length > 0 || stats.topTracks.length > 0));

  // Token missing/expired (e.g. after a session refresh) → don't render an empty
  // shell, just bow out. The rest of the profile still works.
  if (now !== null && recent !== null && stats !== null && !hasAnything) return null;

  return (
    <View style={{ gap: 26 }}>
      {/* Now Playing */}
      <View>
        <SectionTitle icon="dot.radiowaves.left.and.right" title="Now Playing" />
        <Surface radius={22} contentStyle={{ padding: 14 }}>
          {now === null ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>Loading…</Text>
          ) : now.playing && now.track ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Thumb uri={now.track.albumArt} fallback="music.note" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600", marginBottom: 2 }}>
                  ● Playing
                </Text>
                <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 15, fontWeight: "700" }}>
                  {now.track.name}
                </Text>
                <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 13 }}>
                  {now.track.artists}
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Thumb fallback="music.note" />
              <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
                Not playing anything right now
              </Text>
            </View>
          )}
        </Surface>
      </View>

      {/* Recently Played */}
      {recent && recent.length > 0 ? (
        <View>
          <SectionTitle icon="clock.arrow.circlepath" title="Recently Played" />
          <Surface radius={22}>
            {(showAllRecent ? recent : recent.slice(0, RECENT_PREVIEW)).map((t, i, arr) => (
              <Pressable
                key={`${t.id}-${t.playedAt}`}
                onPress={() => openSpotify("track", t.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                  borderBottomColor: colors.border,
                }}>
                <Thumb uri={t.albumArt} fallback="music.note" />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
                    {t.name}
                  </Text>
                  <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 12 }}>
                    {t.artists}
                  </Text>
                </View>
                <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                  {formatPlayed(t.playedAt)}
                </Text>
              </Pressable>
            ))}
          </Surface>
          {recent.length > RECENT_PREVIEW ? (
            <Pressable
              onPress={() => setShowAllRecent((v) => !v)}
              style={{
                marginTop: 10,
                paddingVertical: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                alignItems: "center",
              }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 13, fontWeight: "600" }}>
                {showAllRecent ? "Show less" : `Show ${recent.length - RECENT_PREVIEW} more`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Your Top — unified, swipeable carousels instead of three stacked lists */}
      {stats &&
      (stats.topArtists.length > 0 || stats.topAlbums.length > 0 || stats.topTracks.length > 0) ? (
        <YourTop stats={stats} />
      ) : null}
    </View>
  );
}

type TopTab = "artists" | "songs" | "albums";

function RankBadge({ rank }: { rank: number }) {
  return (
    <View
      style={{
        position: "absolute",
        top: 6,
        left: 6,
        minWidth: 22,
        height: 22,
        paddingHorizontal: 6,
        borderRadius: 8,
        borderCurve: "continuous",
        backgroundColor: "rgba(0,0,0,0.6)",
        alignItems: "center",
        justifyContent: "center",
      }}>
      <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>{rank}</Text>
    </View>
  );
}

function YourTop({ stats }: { stats: TopStats }) {
  // Default to the first tab that actually has data.
  const available: { key: TopTab; label: string }[] = [
    stats.topArtists.length ? { key: "artists" as const, label: "Artists" } : null,
    stats.topTracks.length ? { key: "songs" as const, label: "Songs" } : null,
    stats.topAlbums.length ? { key: "albums" as const, label: "Albums" } : null,
  ].filter((x): x is { key: TopTab; label: string } => x !== null);

  const [tab, setTab] = useState<TopTab>(available[0]?.key ?? "artists");

  return (
    <View>
      <SectionTitle icon="star.fill" title="Your Top" />

      {/* Segmented toggle */}
      <Surface
        radius={999}
        glow={false}
        style={{ marginBottom: 16 }}
        contentStyle={{ flexDirection: "row", padding: 4 }}>
        {available.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: active ? colors.primary : "transparent",
                alignItems: "center",
              }}>
              <Text
                style={{
                  color: active ? colors.primaryForeground : colors.mutedForeground,
                  fontSize: 13,
                  fontWeight: "700",
                }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </Surface>

      {/* Carousel — bleeds to the screen edges for a premium feel */}
      <Animated.View key={tab} entering={FadeIn.duration(220)}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -20 }}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
          {tab === "artists"
            ? stats.topArtists.map((a, i) => (
                <View key={a.id} style={{ width: 96, alignItems: "center", gap: 8 }}>
                  <View>
                    {a.image ? (
                      <Image
                        source={a.image}
                        style={{ width: 92, height: 92, borderRadius: 999 }}
                        contentFit="cover"
                      />
                    ) : (
                      <View
                        style={{
                          width: 92,
                          height: 92,
                          borderRadius: 999,
                          backgroundColor: colors.cardElevated,
                          alignItems: "center",
                          justifyContent: "center",
                        }}>
                        <IconSymbol name="music.mic" size={28} color={colors.mutedForeground} />
                      </View>
                    )}
                    <RankBadge rank={i + 1} />
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: colors.foreground,
                      fontSize: 13,
                      fontWeight: "600",
                      textAlign: "center",
                    }}>
                    {a.name}
                  </Text>
                  {a.genre ? (
                    <Text
                      numberOfLines={1}
                      style={{
                        color: colors.mutedForeground,
                        fontSize: 11,
                        textTransform: "capitalize",
                        textAlign: "center",
                        marginTop: -4,
                      }}>
                      {a.genre}
                    </Text>
                  ) : null}
                </View>
              ))
            : null}

          {tab === "songs"
            ? stats.topTracks.map((t, i) => (
                <Pressable
                  key={t.id}
                  onPress={() => openSpotify("track", t.id)}
                  style={{ width: 136, gap: 8 }}>
                  <View>
                    {t.albumArt ? (
                      <Image
                        source={t.albumArt}
                        style={{ width: 136, height: 136, borderRadius: 14 }}
                        contentFit="cover"
                      />
                    ) : (
                      <View
                        style={{
                          width: 136,
                          height: 136,
                          borderRadius: 14,
                          backgroundColor: colors.cardElevated,
                          alignItems: "center",
                          justifyContent: "center",
                        }}>
                        <IconSymbol name="music.note" size={30} color={colors.mutedForeground} />
                      </View>
                    )}
                    <RankBadge rank={i + 1} />
                  </View>
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
                    {t.name}
                  </Text>
                  <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 12, marginTop: -4 }}>
                    {t.artists}
                  </Text>
                </Pressable>
              ))
            : null}

          {tab === "albums"
            ? stats.topAlbums.map((al, i) => (
                <Pressable
                  key={al.id}
                  onPress={() => openSpotify("album", al.id)}
                  style={{ width: 136, gap: 8 }}>
                  <View>
                    {al.image ? (
                      <Image
                        source={al.image}
                        style={{ width: 136, height: 136, borderRadius: 14 }}
                        contentFit="cover"
                      />
                    ) : (
                      <View
                        style={{
                          width: 136,
                          height: 136,
                          borderRadius: 14,
                          backgroundColor: colors.cardElevated,
                          alignItems: "center",
                          justifyContent: "center",
                        }}>
                        <IconSymbol name="opticaldisc.fill" size={30} color={colors.mutedForeground} />
                      </View>
                    )}
                    <RankBadge rank={i + 1} />
                  </View>
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
                    {al.name}
                  </Text>
                  <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 12, marginTop: -4 }}>
                    {al.artist}
                  </Text>
                </Pressable>
              ))
            : null}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// Tiny wrapper so the parent can fade the whole block in.
export function AnimatedSpotifyStats() {
  return (
    <Animated.View entering={FadeIn.duration(400)}>
      <SpotifyStats />
    </Animated.View>
  );
}
