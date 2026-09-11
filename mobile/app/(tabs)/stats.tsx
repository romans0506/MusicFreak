import { useCallback, useEffect, useRef, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeInDown,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CountUp } from "@/components/count-up";
import { MascotNote } from "@/components/mascot-note";
import { PullRefreshScroll } from "@/components/pull-refresh";
import { Skeleton, SkeletonHero, SkeletonRow } from "@/components/skeleton";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ingestRecentPlays } from "@/lib/scrobble";
import { getTopGenres, type GenreSlice } from "@/lib/spotify";
import { useSpotifyEpoch } from "@/lib/spotify-auth";
import { computeBadges, computeStreak, type Badge, type BadgeId } from "@/lib/stats";
import { supabase } from "@/lib/supabase";
import { colors, scrim } from "@/theme/colors";
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
//
// The whole screen is a horizontal pager over PERIODS — one page per period,
// swiped left/right. Each page carries its own vertical scroll, so the shared
// sections (badges, histogram, genres) are repeated per page rather than living
// under the pager; that's the cost of "the whole screen moves" and it's cheap,
// since they're all already-fetched, all-time figures.

type PlayCount = {
  track_id: string;
  name: string;
  artists: string | null;
  album_art: string | null;
  play_count: number;
};

/**
 * The screen is one horizontal pager over these four periods. They replaced two
 * competing controls that used to sit here — a hero that picked its own period,
 * and a separate Week/Month/All pill row on Most Played — plus a static grid of
 * listening-time cards that duplicated all of it.
 *
 * Windows are rolling, not calendar: "Today" is the last 24 hours, matching how
 * week and month already worked. `unlockDays` is how long we must have been
 * tracking someone before the window means anything.
 */
type PeriodKey = "day" | "week" | "month" | "all";

const PERIODS: {
  key: PeriodKey;
  /** Tab label — short, four have to fit across a phone. */
  tab: string;
  /** Eyebrow over the hero figure. */
  heading: string;
  unlockDays: number;
}[] = [
  { key: "day", tab: "Today", heading: "Last 24 hours", unlockDays: 0 },
  { key: "week", tab: "Week", heading: "This week", unlockDays: 7 },
  { key: "month", tab: "Month", heading: "This month", unlockDays: 30 },
  { key: "all", tab: "All Time", heading: "All time", unlockDays: 0 },
];

/** Everything the pager needs for one period. */
type PeriodStats = { ms: number; plays: number; tracks: PlayCount[] };

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
  periods: Record<PeriodKey, PeriodStats>;
  /** All-time plays. Drives the badges and the shared sections' empty states. */
  totalPlays: number;
  streak: { current: number; longest: number };
  badges: Badge[];
  hourly: Record<PeriodKey, number[]>;
  genres: GenreSlice[];
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

/**
 * The device's IANA timezone, for the RPCs that bucket by calendar day/hour.
 *
 * These used to be called with a hardcoded `p_tz: "UTC"`, which plotted a New
 * York listener's 9pm as 01:00 and — worse — let a Monday-night and Tuesday-
 * morning session fall on the same UTC day, undercounting their streak. Falls
 * back to UTC if Intl is unavailable or returns nothing.
 *
 * NOTE: the web app still hardcodes UTC (src/app/app/stats/page.tsx,
 * src/app/api/wrapped/route.tsx). Until it learns the user's timezone — it is a
 * Server Component, so it needs one stored on `profiles` rather than read from
 * Intl — the two platforms will report different peak hours and streaks for
 * anyone outside UTC.
 */
function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Today as YYYY-MM-DD in LOCAL time — must match get_play_days' p_tz bucketing. */
function localDayIso(d = new Date()): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Cap on the raw rows we pull for the short windows. See `truncated` below. */
const STAMP_LIMIT = 5000;

type Stamp = { played_at: string; duration_ms: number | null };

/** Listening ms in a rolling window, summed from raw rows. */
function sumMs(rows: Stamp[], sinceMs: number): number {
  let total = 0;
  for (const row of rows) {
    if (Date.parse(row.played_at) >= sinceMs) total += Number(row.duration_ms ?? 0);
  }
  return total;
}

/**
 * Hour-of-day histogram for a rolling window, bucketed on the device.
 *
 * `get_play_hours` takes only a timezone, so a per-period histogram would need a
 * `p_since` parameter added to that SQL — and it lives in the Supabase editor,
 * not the repo. Until it grows one we bucket the raw `played_at` timestamps
 * ourselves. One fetch of the last 30 days covers Today, Week and Month; All
 * Time keeps the RPC, where the row count is too large to ship to a phone.
 *
 * Local hours, matching the timezone we now hand the RPC — so the peak hour
 * can't jump between the All Time page and the other three.
 */
function bucketHours(rows: Stamp[], sinceMs: number): number[] {
  const buckets = Array.from({ length: 24 }, () => 0);
  for (const row of rows) {
    const t = Date.parse(row.played_at);
    if (t >= sinceMs) buckets[new Date(t).getHours()]++;
  }
  return buckets;
}

async function fetchStats(): Promise<StatsData> {
  const tz = deviceTimeZone();
  const now = Date.now();
  // Local read, no network — used to scope the favourites count below.
  const uid = (await supabase.auth.getSession()).data.session?.user.id;
  const dayAgo = new Date(now - 86_400_000).toISOString();
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
  const monthAgo = new Date(now - 30 * 86_400_000).toISOString();

  const [
    dayTracks,
    weekTracks,
    monthTracks,
    allTracks,
    dayPlays,
    weekPlays,
    monthPlays,
    totalPlays,
    days,
    hours,
    recentStamps,
    favArtists,
    genres,
    minutesRows,
  ] = await Promise.all([
    counts(dayAgo),
    counts(weekAgo),
    counts(monthAgo),
    counts(null),
    playCount(dayAgo),
    playCount(weekAgo),
    playCount(monthAgo),
    playCount(null),
    supabase.rpc("get_play_days", { p_tz: tz }),
    supabase.rpc("get_play_hours", { p_tz: tz }),
    // Raw rows for the three short windows: they drive both the histograms and
    // the listening-time figures. ORDER MATTERS — without it PostgREST returns
    // rows in physical order, so hitting the cap could drop the newest plays
    // rather than the oldest. Newest-first means a truncated result is still a
    // complete prefix, which is what `oldestMs` below relies on.
    supabase
      .from("play_history")
      .select("played_at, duration_ms")
      .gte("played_at", monthAgo)
      .order("played_at", { ascending: false })
      .limit(STAMP_LIMIT),
    // Must be scoped explicitly: favorite_artists is public-read (artist pages
    // list fans), so RLS doesn't narrow this to the caller.
    uid
      ? supabase
          .from("favorite_artists")
          .select("artist_id", { count: "exact", head: true })
          .eq("user_id", uid)
      : Promise.resolve({ count: 0 }),
    getTopGenres(),
    supabase.rpc("get_listening_minutes"),
  ]);

  const m = (minutesRows.data as Record<string, string | number | null>[] | null)?.[0];
  const stamps = (recentStamps.data as Stamp[]) ?? [];

  /**
   * Listening time for the short windows is summed from the same rolling rows
   * the play counts use, so both halves of a hero provably describe the same
   * window. get_listening_minutes takes no timezone and its windowing isn't in
   * the repo, so it can't be trusted to agree — but it stays as the fallback
   * for any window our rows don't fully cover, and as the only source for All
   * Time, which has no window and so can't disagree with anything.
   */
  const truncated = stamps.length >= STAMP_LIMIT;
  const oldestMs = stamps.length > 0 ? Date.parse(stamps[stamps.length - 1].played_at) : now;
  const msFor = (sinceMs: number, fallback: number) =>
    !truncated || sinceMs >= oldestMs ? sumMs(stamps, sinceMs) : fallback;

  const dayMs = now - 86_400_000;
  const weekMs = now - 7 * 86_400_000;
  const monthMs = now - 30 * 86_400_000;

  const periods: Record<PeriodKey, PeriodStats> = {
    day: { ms: msFor(dayMs, Number(m?.day_ms ?? 0)), plays: dayPlays, tracks: dayTracks },
    week: { ms: msFor(weekMs, Number(m?.week_ms ?? 0)), plays: weekPlays, tracks: weekTracks },
    month: { ms: msFor(monthMs, Number(m?.month_ms ?? 0)), plays: monthPlays, tracks: monthTracks },
    all: { ms: Number(m?.total_ms ?? 0), plays: totalPlays, tracks: allTracks },
  };

  // How long we've been tracking this user — drives which periods are unlocked.
  const firstPlay = m?.first_play ? new Date(m.first_play as string).getTime() : null;
  const trackedDays = firstPlay ? Math.floor((now - firstPlay) / 86_400_000) : 0;

  const dayList = ((days.data as { day: string }[]) ?? []).map((d) => d.day);
  // Local, not toISOString() — get_play_days now buckets in `tz`, and comparing
  // local play-days against a UTC "today" would break the streak at the edges.
  const streak = computeStreak(dayList, localDayIso());

  const hourRows = (hours.data as { hour: number; plays: number }[]) ?? [];
  const hasNightPlay = hourRows.some((h) => h.hour < 5 && Number(h.plays) > 0);

  // All time comes off the RPC, normalized to a dense 24-slot array.
  const hourly: Record<PeriodKey, number[]> = {
    day: bucketHours(stamps, dayMs),
    week: bucketHours(stamps, weekMs),
    month: bucketHours(stamps, monthMs),
    all: Array.from({ length: 24 }, (_, h) => {
      const row = hourRows.find((r) => r.hour === h);
      return row ? Number(row.plays) : 0;
    }),
  };

  const badges = computeBadges({
    totalPlays,
    // Saturates at the 50 above, which is fine *only* because the Explorer
    // badge asks ">= 50". Don't reuse this as a real distinct-track count.
    uniqueTracks: allTracks.length,
    currentStreak: streak.current,
    hasNightPlay,
    favoriteArtistCount: favArtists.count ?? 0,
  });

  return { periods, totalPlays, streak, badges, hourly, genres, trackedDays };
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


/**
 * One tab label. Its own component because each needs a hook, and the colour
 * has to be driven from the shared scroll value rather than an `active`
 * boolean — a boolean can only flip once the swipe settles, which is what made
 * the menu lag behind the page.
 */
function TabLabel({
  label,
  index,
  progress,
}: {
  label: string;
  index: number;
  /** Pager position in pages: 1.5 means half way between tabs 1 and 2. */
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const distance = Math.min(Math.abs(progress.value - index), 1);
    return {
      color: interpolateColor(distance, [0, 1], [colors.foreground, colors.mutedForeground]),
    };
  });

  return (
    <Animated.Text
      numberOfLines={1}
      style={[{ fontSize: 12, fontWeight: "600" }, style]}>
      {label}
    </Animated.Text>
  );
}

/**
 * The period control, pinned over the hero so it stays reachable however far a
 * page is scrolled. It's an indicator as much as a control: with a pager the
 * swipe is the primary gesture, and this is what tells you the gesture exists.
 *
 * The highlight is one absolutely-positioned pill driven by the pager's scroll
 * offset, not a background on whichever tab is "active". That's what keeps it
 * glued to your finger mid-swipe — including when you drag half way and let go,
 * where a settle-time update would snap backwards. Everything moves on the UI
 * thread, so it stays smooth while the pages render.
 */
function PeriodTabs({
  progress,
  onSelect,
  top,
}: {
  progress: SharedValue<number>;
  onSelect: (i: number) => void;
  top: number;
}) {
  // Measured rather than derived from window width: the row is inset by the
  // container's padding and border, and the pill has to line up exactly.
  const [rowWidth, setRowWidth] = useState(0);
  const tabWidth = rowWidth / PERIODS.length;

  const pill = useAnimatedStyle(() => ({
    width: tabWidth,
    transform: [{ translateX: progress.value * tabWidth }],
  }));

  return (
    <View
      style={{
        position: "absolute",
        top: top + 6,
        left: 20,
        right: 20,
        padding: 3,
        borderRadius: 999,
        backgroundColor: "rgba(28,28,30,0.92)",
        borderWidth: 1,
        borderColor: colors.border,
      }}>
      <View
        style={{ flexDirection: "row" }}
        onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
        {rowWidth > 0 ? (
          <Animated.View
            style={[
              {
                position: "absolute",
                top: 0,
                bottom: 0,
                borderRadius: 999,
                backgroundColor: colors.cardElevated,
              },
              pill,
            ]}
          />
        ) : null}

        {PERIODS.map((p, i) => (
          <Pressable
            key={p.key}
            onPress={() => {
              Haptics.selectionAsync();
              onSelect(i);
            }}
            style={{ flex: 1, paddingVertical: 7, alignItems: "center" }}>
            <TabLabel label={p.tab} index={i} progress={progress} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Copy for a period with nothing in it. Freak delivers it — see MascotNote. */
function emptyCopy(period: (typeof PERIODS)[number]): { title: string; body: string } {
  if (period.key === "day") {
    return {
      title: "Today was a quiet day",
      body: "Hope to hear from you soon. Play something on Spotify and it will turn up here.",
    };
  }
  return {
    title: "Nothing here yet",
    body: "Keep the app open while you listen on Spotify and your plays will show up here.",
  };
}

/** One period's page: hero, the shared all-time sections, and its top tracks. */
function PeriodPage({
  data,
  period,
  topInset,
  refreshing,
  onRefresh,
}: {
  data: StatsData;
  period: (typeof PERIODS)[number];
  topInset: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const stats = data.periods[period.key];
  const locked = data.trackedDays < period.unlockDays;
  const empty = !locked && stats.plays === 0;
  const remaining = period.unlockDays - data.trackedDays;

  const tracks = stats.tracks;
  const maxCount = tracks.length > 0 ? Number(tracks[0].play_count) : 1;
  const hourly = data.hourly[period.key];
  const maxHour = Math.max(1, ...hourly);
  const peakHour = hourly.indexOf(Math.max(...hourly));
  const maxGenre = data.genres.length > 0 ? data.genres[0].count : 1;

  // This period's most-played artwork carries the hero, falling back to the
  // all-time one so a thin period still gets an image rather than a grey slab.
  const heroArt = tracks[0]?.album_art ?? data.periods.all.tracks[0]?.album_art ?? null;

  return (
    <PullRefreshScroll
      refreshing={refreshing}
      onRefresh={onRefresh}
      indicatorTop={topInset + 8}
      style={{ flex: 1 }}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{ paddingBottom: 32 }}>
      {locked || empty ? (
        // No hero artwork here on purpose: a big image over "nothing happened"
        // reads as a half-loaded screen. Freak says it instead.
        <View style={{ paddingTop: topInset + 74, paddingHorizontal: 20, paddingBottom: 30 }}>
          <Text style={{ ...typography.eyebrow, color: colors.mutedForeground, marginBottom: 26 }}>
            {period.heading}
          </Text>
          {locked ? (
            <MascotNote
              variant="locked"
              title="Let's listen to some music and wait"
              body={`${period.heading} unlocks once we have tracked you for ${period.unlockDays} days — ${remaining} to go.`}
            />
          ) : (
            <MascotNote {...emptyCopy(period)} />
          )}
        </View>
      ) : (
        /* ---------- Hero: artwork + the one number that matters ---------- */
        <View style={{ height: topInset + 300, justifyContent: "flex-end" }}>
          {heroArt ? (
            <Animated.View entering={FadeIn.duration(600)} style={{ position: "absolute", inset: 0 }}>
              <Image source={heroArt} style={{ width: "100%", height: "100%" }} contentFit="cover" />
              {/* Scrim: art stays legible as texture, text stays legible as text. */}
              <LinearGradient
                colors={[scrim(0.45), scrim(0.7), scrim(0.94), colors.background]}
                locations={[0, 0.45, 0.78, 1]}
                style={{ position: "absolute", inset: 0 }}
              />
            </Animated.View>
          ) : (
            /* No artwork: flat accent panel. */
            <View
              style={{ position: "absolute", inset: 0, backgroundColor: colors.primarySoft }}
            />
          )}

          <View style={{ paddingHorizontal: 20, paddingBottom: 24, gap: 6 }}>
            <Text style={{ ...typography.eyebrow, color: colors.mutedForeground }}>
              {period.heading}
            </Text>

            <CountUp
              value={stats.ms}
              format={formatListen}
              style={{ ...typography.hero, color: colors.foreground }}
            />

            <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
              {stats.plays.toLocaleString("en")} plays
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
            ) : null}
          </View>
        </View>
      )}

      <View style={{ paddingHorizontal: 20, gap: 30 }}>
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

        {/* ---------- When you listen, for THIS period ---------- */}
        <Animated.View entering={FadeInDown.delay(240).duration(500)}>
          <SectionTitle
            icon="chart.bar.fill"
            title="When you listen"
            trailing={period.heading.toLowerCase()}
          />
          {stats.plays === 0 ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, paddingVertical: 12 }}>
              No plays tracked in this window
            </Text>
          ) : (
            <>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 104 }}>
                {hourly.map((plays, h) => (
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
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
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

        {/* ---------- Top genres. Spotify's own window, not this period's. ---------- */}
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

        {/* ---------- Most played, for THIS period ---------- */}
        {tracks.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(360).duration(500)}>
            <SectionTitle
              icon="music.note.list"
              title="Most played"
              trailing={period.heading.toLowerCase()}
            />
            {/* Rows, not cards: a hairline is enough separation, and dropping the
                card frame lets the artwork read as the content. */}
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
                      <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 12 }}>
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
          </Animated.View>
        ) : null}
      </View>
    </PullRefreshScroll>
  );
}

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Opens on Today: it is the leftmost page, so the pager starts where a swipe
  // can only go one way, which is the clearest hint that swiping is possible.
  const pager = useRef<ScrollView>(null);
  // Pager position in pages (1.5 = half way between tabs 1 and 2). The tab
  // highlight rides this, so it tracks the swipe instead of catching up at the
  // end. Kept as a shared value so the whole thing runs on the UI thread and
  // never re-renders the four pages mid-gesture.
  const progress = useSharedValue(0);
  // Only for the settle haptic. A ref, not state — a re-render per scroll frame
  // would defeat the point of driving the highlight off the UI thread.
  const settled = useRef(0);

  const onScroll = useAnimatedScrollHandler((e) => {
    progress.value = e.contentOffset.x / Math.max(1, e.layoutMeasurement.width);
  });
  // Each page roots in PullRefreshScroll, which is flex: 1 and therefore needs a
  // parent with a definite height. Relying on the horizontal ScrollView's
  // cross-axis stretch would probably work, but measuring is certain.
  const [pageHeight, setPageHeight] = useState(0);

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

  const goTo = useCallback(
    (i: number) => {
      // The scroll handler moves `progress` for us as the pager animates over.
      pager.current?.scrollTo({ x: i * width, animated: true });
      settled.current = i;
    },
    [width],
  );

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
      <Animated.ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // Each page owns a PullRefreshScroll, whose pan already declares
        // failOffsetX([-16, 16]) — so a horizontal swipe wins outright and the
        // two gestures need no arbitration here.
        onMomentumScrollEnd={(e) => {
          const next = Math.round(e.nativeEvent.contentOffset.x / width);
          if (next !== settled.current) {
            Haptics.selectionAsync();
            settled.current = next;
          }
        }}
        onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}
        style={{ flex: 1 }}>
        {PERIODS.map((p) => (
          <View key={p.key} style={{ width, height: pageHeight || undefined }}>
            <PeriodPage
              data={data}
              period={p}
              topInset={insets.top}
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          </View>
        ))}
      </Animated.ScrollView>

      <PeriodTabs progress={progress} onSelect={goTo} top={insets.top} />
    </View>
  );
}
