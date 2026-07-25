import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";

import { GlowBackground } from "@/components/glow-background";
import { getTopGenres, type GenreSlice } from "@/lib/spotify";
import { computeBadges, computeStreak, type Badge, type BadgeId } from "@/lib/stats";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/colors";
import { cardSurface, softShadow } from "@/theme/surfaces";

// Mirrors the web /app/stats page. Every number here comes from OUR own
// play_history table via the aggregation RPCs (Spotify exposes no play counts) —
// those are `security invoker`, so RLS scopes them to the signed-in user and the
// device can call them directly. Only the genre breakdown needs a Spotify token,
// so it degrades to a hidden section when the token has aged out.

type PlayCount = {
  track_id: string;
  name: string;
  artists: string | null;
  album_art: string | null;
  play_count: number;
};

type Range = "week" | "month" | "all";
const RANGES: { key: Range; label: string }[] = [
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
];

type ListenKey = "day" | "week" | "month" | "year";
const PERIODS: { key: ListenKey; label: string; unlockDays: number }[] = [
  { key: "day", label: "Today", unlockDays: 0 },
  { key: "week", label: "This Week", unlockDays: 7 },
  { key: "month", label: "This Month", unlockDays: 30 },
  { key: "year", label: "This Year", unlockDays: 365 },
];

// The web build uses lucide icons here; emoji keep this cross-platform without
// pulling SF Symbols (iOS-only) into a data screen.
const BADGE_EMOJI: Record<BadgeId, string> = {
  "first-play": "✨",
  century: "🏆",
  explorer: "🧭",
  dedicated: "🔥",
  "night-owl": "🌙",
  superfan: "❤️",
};

type StatsData = {
  week: PlayCount[];
  month: PlayCount[];
  all: PlayCount[];
  totalPlays: number;
  streak: { current: number; longest: number };
  badges: Badge[];
  hourly: number[];
  genres: GenreSlice[];
  listening: Record<ListenKey | "total", number>;
  trackedDays: number;
};

/** ms → "Xh Ym" (or "Ym" under an hour). */
function formatListen(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m`;
}

async function counts(since: string | null): Promise<PlayCount[]> {
  const { data } = await supabase.rpc("get_play_counts", { p_since: since }).limit(50);
  return (data as PlayCount[]) ?? [];
}

async function fetchStats(): Promise<StatsData> {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
  const monthAgo = new Date(now - 30 * 86_400_000).toISOString();

  const [week, month, all, days, hours, favArtists, genres, minutesRows] = await Promise.all([
    counts(weekAgo),
    counts(monthAgo),
    counts(null),
    supabase.rpc("get_play_days", { p_tz: "UTC" }),
    supabase.rpc("get_play_hours", { p_tz: "UTC" }),
    supabase.from("favorite_artists").select("artist_id", { count: "exact", head: true }),
    getTopGenres(),
    supabase.rpc("get_listening_minutes"),
  ]);

  const m = (minutesRows.data as Record<string, string | number | null>[] | null)?.[0];
  const listening = {
    day: Number(m?.day_ms ?? 0),
    week: Number(m?.week_ms ?? 0),
    month: Number(m?.month_ms ?? 0),
    year: Number(m?.year_ms ?? 0),
    total: Number(m?.total_ms ?? 0),
  };

  // How long we've been tracking this user — drives which periods are unlocked.
  const firstPlay = m?.first_play ? new Date(m.first_play as string).getTime() : null;
  const trackedDays = firstPlay ? Math.floor((now - firstPlay) / 86_400_000) : 0;

  const totalPlays = all.reduce((sum, t) => sum + Number(t.play_count), 0);

  const dayList = ((days.data as { day: string }[]) ?? []).map((d) => d.day);
  const streak = computeStreak(dayList, new Date().toISOString().slice(0, 10));

  const hourRows = (hours.data as { hour: number; plays: number }[]) ?? [];
  const hasNightPlay = hourRows.some((h) => h.hour < 5 && Number(h.plays) > 0);

  // Normalize to a dense 24-slot array for the hourly chart.
  const hourly = Array.from({ length: 24 }, (_, h) => {
    const row = hourRows.find((r) => r.hour === h);
    return row ? Number(row.plays) : 0;
  });

  const badges = computeBadges({
    totalPlays,
    uniqueTracks: all.length,
    currentStreak: streak.current,
    hasNightPlay,
    favoriteArtistCount: favArtists.count ?? 0,
  });

  return { week, month, all, totalPlays, streak, badges, hourly, genres, listening, trackedDays };
}

function SectionTitle({ emoji, title, trailing }: { emoji: string; title: string; trailing?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <Text style={{ fontSize: 15 }}>{emoji}</Text>
      <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "700" }}>{title}</Text>
      {trailing ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{trailing}</Text>
      ) : null}
    </View>
  );
}

export default function StatsScreen() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<Range>("all");

  const load = useCallback(async () => {
    try {
      setData(await fetchStats());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await fetchStats());
    } finally {
      setRefreshing(false);
    }
  }, []);

  const tracks = data ? (range === "week" ? data.week : range === "month" ? data.month : data.all) : [];
  const maxCount = tracks.length > 0 ? Number(tracks[0].play_count) : 1;
  const maxHour = data ? Math.max(1, ...data.hourly) : 1;
  const peakHour = data ? data.hourly.indexOf(Math.max(...data.hourly)) : 0;
  const maxGenre = data && data.genres.length > 0 ? data.genres[0].count : 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlowBackground />
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 20, gap: 20 }}
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
            Listening Stats
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 15 }}>
            Plays we&apos;ve tracked since you started using MusicFreak.
          </Text>
        </Animated.View>

        {loading || !data ? (
          <View style={{ paddingVertical: 80, alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {/* Streak banner */}
            <Animated.View
              entering={FadeInDown.delay(80).duration(500)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
                padding: 18,
                borderRadius: 22,
                borderCurve: "continuous",
                borderWidth: 1,
                borderColor: "rgba(200,30,51,0.3)",
                backgroundColor: colors.primarySoft,
              }}>
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 18,
                  borderCurve: "continuous",
                  backgroundColor: "rgba(200,30,51,0.2)",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                <Text style={{ fontSize: 26, opacity: data.streak.current > 0 ? 1 : 0.4 }}>🔥</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "800" }}>
                  {data.streak.current}{" "}
                  <Text style={{ fontSize: 15, fontWeight: "500", color: colors.mutedForeground }}>
                    day{data.streak.current === 1 ? "" : "s"} streak
                  </Text>
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                  {data.streak.current > 0
                    ? "Keep listening daily to grow it 🔥"
                    : "Listen today to start a streak"}
                  {data.streak.longest > 0 ? ` · Longest: ${data.streak.longest}` : ""}
                </Text>
              </View>
            </Animated.View>

            {/* Summary */}
            <Animated.View
              entering={FadeInDown.delay(140).duration(500)}
              style={{ flexDirection: "row", gap: 12 }}>
              {[
                { value: data.totalPlays, label: "Total plays tracked" },
                { value: data.all.length, label: "Unique songs" },
              ].map((s) => (
                <View key={s.label} style={{ ...cardSurface, ...softShadow, flex: 1, padding: 18, gap: 4 }}>
                  <Text style={{ color: colors.primary, fontSize: 24, fontWeight: "800" }}>
                    {s.value.toLocaleString("en")}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{s.label}</Text>
                </View>
              ))}
            </Animated.View>

            {/* Listening time */}
            <Animated.View entering={FadeInDown.delay(200).duration(500)}>
              <SectionTitle emoji="⏱️" title="Listening time" />
              <Text style={{ color: colors.mutedForeground, fontSize: 13, marginBottom: 14, lineHeight: 19 }}>
                {data.listening.total > 0
                  ? `You've listened for ${formatListen(data.listening.total)} (${Math.round(
                      data.listening.total / 60000,
                    ).toLocaleString("en")} minutes) since you started.`
                  : "Keep the app open while you listen on Spotify — your minutes will add up here."}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {PERIODS.map((p) => {
                  const locked = data.trackedDays < p.unlockDays;
                  const remaining = p.unlockDays - data.trackedDays;
                  return (
                    <View
                      key={p.key}
                      style={{
                        ...cardSurface,
                        ...(locked ? null : softShadow),
                        width: "47.5%",
                        flexGrow: 1,
                        minHeight: 96,
                        padding: 16,
                        justifyContent: "center",
                        gap: 4,
                        // Locked tiles sit flat and dim — only unlocked ones lift.
                        opacity: locked ? 0.65 : 1,
                      }}>
                      {locked ? (
                        <View style={{ alignItems: "center", gap: 4 }}>
                          <Text style={{ fontSize: 18, opacity: 0.5 }}>🔒</Text>
                          <Text style={{ color: colors.mutedForeground, fontSize: 13, fontWeight: "600" }}>
                            {p.label}
                          </Text>
                          <Text style={{ color: colors.mutedForeground, fontSize: 11, opacity: 0.8 }}>
                            Unlocks in {remaining} day{remaining === 1 ? "" : "s"}
                          </Text>
                        </View>
                      ) : (
                        <>
                          <Text style={{ color: colors.primary, fontSize: 22, fontWeight: "800" }}>
                            {formatListen(data.listening[p.key])}
                          </Text>
                          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{p.label}</Text>
                        </>
                      )}
                    </View>
                  );
                })}
              </View>
            </Animated.View>

            {/* Badges */}
            <Animated.View entering={FadeInDown.delay(260).duration(500)}>
              <SectionTitle
                emoji="✨"
                title="Badges"
                trailing={`${data.badges.filter((b) => b.earned).length}/${data.badges.length}`}
              />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {data.badges.map((badge) => (
                  <View
                    key={badge.id}
                    style={{
                      ...cardSurface,
                      width: "47.5%",
                      flexGrow: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      padding: 14,
                      opacity: badge.earned ? 1 : 0.5,
                      borderColor: badge.earned ? "rgba(200,30,51,0.3)" : colors.border,
                    }}>
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 13,
                        borderCurve: "continuous",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: badge.earned ? colors.primarySoft : colors.cardElevated,
                      }}>
                      <Text style={{ fontSize: 18 }}>{BADGE_EMOJI[badge.id]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={{ color: colors.foreground, fontSize: 13, fontWeight: "700" }}>
                        {badge.label}
                      </Text>
                      <Text numberOfLines={2} style={{ color: colors.mutedForeground, fontSize: 11 }}>
                        {badge.description}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </Animated.View>

            {/* When you listen */}
            <Animated.View entering={FadeInDown.delay(320).duration(500)} style={{ ...cardSurface, padding: 18 }}>
              <SectionTitle emoji="📊" title="When you listen" />
              {data.totalPlays === 0 ? (
                <Text
                  style={{
                    color: colors.mutedForeground,
                    fontSize: 13,
                    textAlign: "center",
                    paddingVertical: 20,
                  }}>
                  No plays tracked yet
                </Text>
              ) : (
                <>
                  <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 112 }}>
                    {data.hourly.map((plays, h) => (
                      <View
                        key={h}
                        style={{
                          flex: 1,
                          height: Math.max(2, (plays / maxHour) * 112),
                          borderTopLeftRadius: 3,
                          borderTopRightRadius: 3,
                          backgroundColor: h === peakHour ? colors.primary : "rgba(200,30,51,0.35)",
                        }}
                      />
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                    {["0h", "6h", "12h", "18h", "23h"].map((l) => (
                      <Text key={l} style={{ color: colors.mutedForeground, fontSize: 10 }}>
                        {l}
                      </Text>
                    ))}
                  </View>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 8 }}>
                    Peak hour:{" "}
                    <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                      {peakHour}:00–{peakHour + 1}:00
                    </Text>
                  </Text>
                </>
              )}
            </Animated.View>

            {/* Top genres */}
            <Animated.View entering={FadeInDown.delay(380).duration(500)} style={{ ...cardSurface, padding: 18 }}>
              <SectionTitle emoji="🎵" title="Top genres" />
              {data.genres.length === 0 ? (
                <Text
                  style={{
                    color: colors.mutedForeground,
                    fontSize: 13,
                    textAlign: "center",
                    paddingVertical: 20,
                  }}>
                  Listen to more music to see your genres
                </Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {data.genres.map((g) => (
                    <View key={g.genre} style={{ gap: 5 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                        <Text
                          numberOfLines={1}
                          style={{
                            color: colors.foreground,
                            fontSize: 12,
                            flex: 1,
                            textTransform: "capitalize",
                          }}>
                          {g.genre}
                        </Text>
                        <Text
                          style={{
                            color: colors.mutedForeground,
                            fontSize: 12,
                            fontVariant: ["tabular-nums"],
                          }}>
                          {g.count}
                        </Text>
                      </View>
                      <View
                        style={{
                          height: 6,
                          borderRadius: 999,
                          backgroundColor: colors.cardElevated,
                          overflow: "hidden",
                        }}>
                        <View
                          style={{
                            height: "100%",
                            width: `${(g.count / maxGenre) * 100}%`,
                            borderRadius: 999,
                            backgroundColor: colors.primary,
                          }}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Animated.View>

            {/* Range pills */}
            <Animated.View
              entering={FadeInDown.delay(440).duration(500)}
              style={{
                flexDirection: "row",
                alignSelf: "flex-start",
                gap: 4,
                padding: 4,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
              }}>
              {RANGES.map((r) => {
                const active = range === r.key;
                return (
                  <Pressable
                    key={r.key}
                    onPress={() => setRange(r.key)}
                    style={({ pressed }) => ({
                      paddingHorizontal: 14,
                      paddingVertical: 7,
                      borderRadius: 999,
                      backgroundColor: active ? colors.cardElevated : "transparent",
                      transform: [{ scale: pressed ? 0.96 : 1 }],
                    })}>
                    <Text
                      style={{
                        color: active ? colors.foreground : colors.mutedForeground,
                        fontSize: 13,
                        fontWeight: "600",
                      }}>
                      {r.label}
                    </Text>
                  </Pressable>
                );
              })}
            </Animated.View>

            {/* Most played list */}
            {tracks.length === 0 ? (
              <View style={{ ...cardSurface, alignItems: "center", gap: 8, paddingVertical: 60, paddingHorizontal: 20 }}>
                <Text style={{ fontSize: 32 }}>📊</Text>
                <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "600" }}>
                  No plays tracked yet
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: "center" }}>
                  Keep the app open while you listen on Spotify — your plays will show up here.
                </Text>
              </View>
            ) : (
              <View style={{ ...cardSurface, overflow: "hidden" }}>
                {tracks.map((track, i) => {
                  const count = Number(track.play_count);
                  return (
                    <Pressable
                      key={track.track_id}
                      onPress={() =>
                        Linking.openURL(`https://open.spotify.com/track/${track.track_id}`)
                      }
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 11,
                        borderBottomWidth: i < tracks.length - 1 ? 1 : 0,
                        borderBottomColor: colors.border,
                        backgroundColor: pressed ? colors.cardElevated : "transparent",
                      })}>
                      <Text
                        style={{
                          width: 20,
                          color: colors.mutedForeground,
                          fontSize: 13,
                          fontWeight: "600",
                          fontVariant: ["tabular-nums"],
                        }}>
                        {i + 1}
                      </Text>

                      {track.album_art ? (
                        <Image
                          source={track.album_art}
                          style={{ width: 42, height: 42, borderRadius: 8 }}
                          contentFit="cover"
                        />
                      ) : (
                        <View
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 8,
                            backgroundColor: colors.cardElevated,
                            alignItems: "center",
                            justifyContent: "center",
                          }}>
                          <Text style={{ fontSize: 16, opacity: 0.4 }}>🎵</Text>
                        </View>
                      )}

                      <View style={{ flex: 1, gap: 4 }}>
                        <Text
                          numberOfLines={1}
                          style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
                          {track.name}
                        </Text>
                        <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 12 }}>
                          {track.artists}
                        </Text>
                        <View
                          style={{
                            height: 3,
                            borderRadius: 999,
                            backgroundColor: colors.cardElevated,
                            overflow: "hidden",
                          }}>
                          <View
                            style={{
                              height: "100%",
                              width: `${(count / maxCount) * 100}%`,
                              borderRadius: 999,
                              backgroundColor: colors.primary,
                            }}
                          />
                        </View>
                      </View>

                      <Text
                        style={{
                          color: colors.primary,
                          fontSize: 14,
                          fontWeight: "700",
                          fontVariant: ["tabular-nums"],
                        }}>
                        {count}
                        <Text style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: "400" }}>
                          {count === 1 ? " play" : " plays"}
                        </Text>
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
