import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CountUp } from "@/components/count-up";
import { PullRefreshScroll } from "@/components/pull-refresh";
import { Skeleton, SkeletonHero, SkeletonRow } from "@/components/skeleton";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ingestRecentPlays } from "@/lib/scrobble";
import { getTopGenres, type GenreSlice } from "@/lib/spotify";
import { useSpotifyEpoch } from "@/lib/spotify-auth";
import { computeBadges, computeStreak, type Badge, type BadgeId } from "@/lib/stats";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/type";
import { cardSurface } from "@/theme/surfaces";

// Mirrors the web /app/stats page. Every number here comes from OUR own
// play_history table via the aggregation RPCs (Spotify exposes no play counts) —
// those are `security invoker`, so RLS scopes them to the signed-in user and the
// device can call them directly. Only the genre breakdown needs a Spotify token,
// so it degrades to a hidden section when the token has aged out.
//
// Layout: this screen leads with ONE hero number over the artwork of the track
// you've played most, rather than a grid of same-sized tiles. Everything below
// the hero is supporting detail and is deliberately quieter.

type PlayCount = {
  track_id: string;
  name: string;
  artists: string | null;
  album_art: string | null;
  play_count: number;
};

type Range = "week" | "month" | "all";
const RANGES: { key: Range; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "all", label: "All" },
];

type ListenKey = "day" | "week" | "month" | "year";
const PERIODS: { key: ListenKey; label: string; unlockDays: number }[] = [
  { key: "day", label: "Today", unlockDays: 0 },
  { key: "week", label: "This Week", unlockDays: 7 },
  { key: "month", label: "This Month", unlockDays: 30 },
  { key: "year", label: "This Year", unlockDays: 365 },
];

type SymbolName = Parameters<typeof IconSymbol>[0]["name"];

const BADGE_ICONS: Record<BadgeId, SymbolName> = {
  "first-play": "sparkles",
  century: "trophy.fill",
  explorer: "map.fill",
  dedicated: "flame.fill",
  "night-owl": "moon.fill",
  superfan: "heart.fill",
};

type StatsData = {
  week: PlayCount[];
  month: PlayCount[];
  all: PlayCount[];
  /** All-time. Drives the badges and the empty state. */
  totalPlays: number;
  /** Last 7 days — shown instead of totalPlays while the hero reads "This week". */
  weekPlays: number;
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

/**
 * Top tracks for the table. The 50 is a DISPLAY cap.
 *
 * Never derive an aggregate from this list's length or sum — it saturates at 50
 * and silently stops growing. That's exactly how "plays" came to undercount
 * everyone past 50 distinct tracks, drifting further the more they listened.
 * Totals come from totalPlayCount() instead.
 */
async function counts(since: string | null): Promise<PlayCount[]> {
  const { data } = await supabase.rpc("get_play_counts", { p_since: since }).limit(50);
  return (data as PlayCount[]) ?? [];
}

/**
 * How many plays we've recorded, optionally since a timestamp. `play_history`
 * holds one row per play, so a head count *is* the answer — exact, uncapped,
 * and it transfers no rows at all.
 *
 * `since` uses the same rolling 7-day window as the week track list above. If
 * get_listening_minutes' week_ms turns out to be a calendar week, the two week
 * figures in the hero could disagree slightly; that SQL isn't in the repo.
 */
async function playCount(since: string | null): Promise<number> {
  let q = supabase.from("play_history").select("*", { count: "exact", head: true });
  if (since) q = q.gte("played_at", since);
  const { count } = await q;
  return count ?? 0;
}

async function fetchStats(): Promise<StatsData> {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
  const monthAgo = new Date(now - 30 * 86_400_000).toISOString();

  const [week, month, all, totalPlays, weekPlays, days, hours, favArtists, genres, minutesRows] =
    await Promise.all([
    counts(weekAgo),
    counts(monthAgo),
    counts(null),
    playCount(null),
    playCount(weekAgo),
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
    // Saturates at the 50 above, which is fine *only* because the Explorer
    // badge asks ">= 50". Don't reuse this as a real distinct-track count.
    uniqueTracks: all.length,
    currentStreak: streak.current,
    hasNightPlay,
    favoriteArtistCount: favArtists.count ?? 0,
  });

  return {
    week,
    month,
    all,
    totalPlays,
    weekPlays,
    streak,
    badges,
    hourly,
    genres,
    listening,
    trackedDays,
  };
}

function SectionTitle({
  icon,
  title,
  trailing,
}: {
  icon: SymbolName;
  title: string;
  trailing?: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <IconSymbol name={icon} size={16} color={colors.primary} />
      <Text style={{ ...typography.section, color: colors.foreground }}>{title}</Text>
      {trailing ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{trailing}</Text>
      ) : null}
    </View>
  );
}

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<Range>("all");

  const epoch = useSpotifyEpoch();
  const load = useCallback(async () => {
    try {
      setData(await fetchStats());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Reading `epoch` is what re-runs this when Spotify reconnects — the genre
    // breakdown is the part of this screen that needs a live Spotify token.
    void epoch;
    load();
  }, [load, epoch]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Bank any new plays first, so the numbers below actually move.
      await ingestRecentPlays({ force: true });
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

  // The hero shows the liveliest period we can honestly show: this week once
  // we've tracked long enough for it to mean something, otherwise all-time.
  const heroIsWeek = !!data && data.trackedDays >= 7 && data.listening.week > 0;
  const heroMs = data ? (heroIsWeek ? data.listening.week : data.listening.total) : 0;
  // The plays figure sits under the period label, so it has to obey it — an
  // all-time count beneath a "This week" heading just reads as wrong.
  const heroPlays = data ? (heroIsWeek ? data.weekPlays : data.totalPlays) : 0;
  // The most-played track's artwork carries the hero. It's already in the payload.
  const heroArt = data?.all[0]?.album_art ?? null;

  if (loading || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SkeletonHero height={insets.top + 300} />
        <View style={{ paddingHorizontal: 20, marginTop: 20, gap: 20 }}>
          <Skeleton width={140} height={16} radius={5} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Skeleton width="47.5%" height={88} radius={22} style={{ flexGrow: 1 }} />
            <Skeleton width="47.5%" height={88} radius={22} style={{ flexGrow: 1 }} />
          </View>
          <SkeletonRow />
          <SkeletonRow />
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
        contentContainerStyle={{ paddingBottom: 32 }}>
        {/* ---------- Hero: artwork + the one number that matters ---------- */}
        <View style={{ height: insets.top + 300, justifyContent: "flex-end" }}>
          {heroArt ? (
            <Animated.View entering={FadeIn.duration(600)} style={{ position: "absolute", inset: 0 }}>
              <Image source={heroArt} style={{ width: "100%", height: "100%" }} contentFit="cover" />
              {/* Scrim: art stays legible as texture, text stays legible as text. */}
              <LinearGradient
                colors={[
                  "rgba(18,18,18,0.45)",
                  "rgba(18,18,18,0.70)",
                  "rgba(18,18,18,0.94)",
                  colors.background,
                ]}
                locations={[0, 0.45, 0.78, 1]}
                style={{ position: "absolute", inset: 0 }}
              />
            </Animated.View>
          ) : (
            // No plays yet — a plain crimson wash rather than a broken image slot.
            <LinearGradient
              colors={["rgba(200,30,51,0.28)", colors.background]}
              style={{ position: "absolute", inset: 0 }}
            />
          )}

          <View style={{ paddingHorizontal: 20, paddingBottom: 24, gap: 6 }}>
            <Text
              style={{ ...typography.eyebrow, color: colors.mutedForeground }}>
              {heroIsWeek ? "This week" : "All time"}
            </Text>

            <CountUp
              value={heroMs}
              format={formatListen}
              style={{ ...typography.hero, color: colors.foreground }}
            />

            <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
              {heroPlays.toLocaleString("en")} plays
            </Text>

            {data.streak.current > 0 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                <IconSymbol name="flame.fill" size={15} color={colors.primary} />
                <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
                  {data.streak.current} day streak
                </Text>
                {data.streak.longest > data.streak.current ? (
                  <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                    · best {data.streak.longest}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 6 }}>
                Listen today to start a streak
              </Text>
            )}
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, gap: 28, marginTop: 8 }}>
          {/* ---------- Listening time ---------- */}
          <Animated.View entering={FadeInDown.delay(120).duration(500)}>
            <SectionTitle icon="clock.fill" title="Listening time" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {PERIODS.map((p) => {
                const locked = data.trackedDays < p.unlockDays;
                const remaining = p.unlockDays - data.trackedDays;
                return (
                  <View
                    key={p.key}
                    style={{
                      ...cardSurface,
                      width: "47.5%",
                      flexGrow: 1,
                      minHeight: 88,
                      padding: 16,
                      justifyContent: "center",
                      gap: 4,
                      opacity: locked ? 0.55 : 1,
                    }}>
                    {locked ? (
                      <View style={{ alignItems: "center", gap: 5 }}>
                        <IconSymbol name="lock.fill" size={15} color={colors.mutedForeground} />
                        <Text
                          style={{ color: colors.mutedForeground, fontSize: 13, fontWeight: "600" }}>
                          {p.label}
                        </Text>
                        <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                          Unlocks in {remaining} day{remaining === 1 ? "" : "s"}
                        </Text>
                      </View>
                    ) : (
                      <>
                        <Text
                          style={{ ...typography.figure, color: colors.foreground }}>
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

          {/* ---------- Badges ---------- */}
          <Animated.View entering={FadeInDown.delay(180).duration(500)}>
            <SectionTitle
              icon="sparkles"
              title="Badges"
              trailing={`${data.badges.filter((b) => b.earned).length}/${data.badges.length}`}
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
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
                    padding: 13,
                    opacity: badge.earned ? 1 : 0.45,
                    borderColor: badge.earned ? "rgba(200,30,51,0.3)" : colors.border,
                  }}>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 12,
                      borderCurve: "continuous",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: badge.earned ? colors.primarySoft : colors.cardElevated,
                    }}>
                    <IconSymbol
                      name={BADGE_ICONS[badge.id]}
                      size={16}
                      color={badge.earned ? colors.primary : colors.mutedForeground}
                    />
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

          {/* ---------- When you listen ---------- */}
          <Animated.View entering={FadeInDown.delay(240).duration(500)}>
            <SectionTitle icon="chart.bar.fill" title="When you listen" />
            {data.totalPlays === 0 ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 13, paddingVertical: 12 }}>
                No plays tracked yet
              </Text>
            ) : (
              <>
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 104 }}>
                  {data.hourly.map((plays, h) => (
                    <View
                      key={h}
                      style={{
                        flex: 1,
                        height: Math.max(2, (plays / maxHour) * 104),
                        borderTopLeftRadius: 3,
                        borderTopRightRadius: 3,
                        backgroundColor: h === peakHour ? colors.primary : "rgba(200,30,51,0.3)",
                      }}
                    />
                  ))}
                </View>
                <View
                  style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                  {["0h", "6h", "12h", "18h", "23h"].map((l) => (
                    <Text key={l} style={{ color: colors.mutedForeground, fontSize: 10 }}>
                      {l}
                    </Text>
                  ))}
                </View>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 10 }}>
                  Peak hour{" "}
                  <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                    {peakHour}:00–{peakHour + 1}:00
                  </Text>
                </Text>
              </>
            )}
          </Animated.View>

          {/* ---------- Top genres ---------- */}
          {data.genres.length > 0 ? (
            <Animated.View entering={FadeInDown.delay(300).duration(500)}>
              <SectionTitle icon="music.note" title="Top genres" />
              <View style={{ gap: 11 }}>
                {data.genres.map((g) => (
                  <View key={g.genre} style={{ gap: 5 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: colors.foreground,
                          fontSize: 13,
                          flex: 1,
                          textTransform: "capitalize",
                        }}>
                        {g.genre}
                      </Text>
                      <Text
                        style={{
                          color: colors.mutedForeground,
                          fontSize: 13,
                          fontVariant: ["tabular-nums"],
                        }}>
                        {g.count}
                      </Text>
                    </View>
                    <View
                      style={{
                        height: 5,
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
            </Animated.View>
          ) : null}

          {/* ---------- Most played ---------- */}
          <Animated.View entering={FadeInDown.delay(360).duration(500)}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}>
              <Text style={{ ...typography.section, color: colors.foreground }}>
                Most played
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  gap: 2,
                  padding: 3,
                  borderRadius: 999,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}>
                {RANGES.map((r) => {
                  const active = range === r.key;
                  return (
                    <Pressable
                      key={r.key}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setRange(r.key);
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: active ? colors.cardElevated : "transparent",
                      }}>
                      <Text
                        style={{
                          color: active ? colors.foreground : colors.mutedForeground,
                          fontSize: 12,
                          fontWeight: "600",
                        }}>
                        {r.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {tracks.length === 0 ? (
              <View
                style={{
                  ...cardSurface,
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 48,
                  paddingHorizontal: 24,
                }}>
                <IconSymbol name="chart.bar.fill" size={26} color={colors.mutedForeground} />
                <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "600" }}>
                  Nothing here yet
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: "center" }}>
                  Keep the app open while you listen on Spotify and your plays will show up here.
                </Text>
              </View>
            ) : (
              // Rows, not cards: a hairline is enough separation, and dropping the
              // card frame lets the artwork read as the content.
              <View>
                {tracks.map((track, i) => {
                  const count = Number(track.play_count);
                  return (
                    <Pressable
                      key={track.track_id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        Linking.openURL(`https://open.spotify.com/track/${track.track_id}`);
                      }}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        paddingVertical: 10,
                        borderBottomWidth: i < tracks.length - 1 ? 1 : 0,
                        borderBottomColor: colors.border,
                        opacity: pressed ? 0.6 : 1,
                      })}>
                      <Text
                        style={{
                          width: 20,
                          color: i === 0 ? colors.primary : colors.mutedForeground,
                          fontSize: 13,
                          fontWeight: "700",
                          fontVariant: ["tabular-nums"],
                        }}>
                        {i + 1}
                      </Text>

                      {track.album_art ? (
                        <Image
                          source={track.album_art}
                          style={{ width: 46, height: 46, borderRadius: 8 }}
                          contentFit="cover"
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

                      <View style={{ flex: 1, gap: 3 }}>
                        <Text
                          numberOfLines={1}
                          style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
                          {track.name}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={{ color: colors.mutedForeground, fontSize: 12 }}>
                          {track.artists}
                        </Text>
                        <View
                          style={{
                            height: 2,
                            borderRadius: 999,
                            backgroundColor: colors.cardElevated,
                            overflow: "hidden",
                            marginTop: 2,
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
                          color: colors.foreground,
                          fontSize: 14,
                          fontWeight: "700",
                          fontVariant: ["tabular-nums"],
                        }}>
                        {count}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Animated.View>
        </View>
      </PullRefreshScroll>
    </View>
  );
}
