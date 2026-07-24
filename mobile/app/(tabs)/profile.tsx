import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";

import EditProfileSheet from "@/components/edit-profile-sheet";
import FavoriteSongs from "@/components/favorite-songs";
import { GlassCard } from "@/components/glass-card";
import { GlowBackground } from "@/components/glow-background";
import { AnimatedSpotifyStats } from "@/components/spotify-stats";
import { useSession } from "@/lib/auth";
import { countryName, flagUrl } from "@/lib/countries";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/colors";

type MostPlayed = {
  track_id: string;
  name: string;
  artists: string | null;
  album_art: string | null;
  play_count: number;
};

type ProfileRow = {
  username: string | null;
  bio: string | null;
  custom_avatar_url: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  country: string | null;
};

type Stats = {
  totalPoints: number;
  gamesPlayed: number;
  rank: number | null;
  mostPlayed: MostPlayed[];
  minutesTotal: number;
  minutesWeek: number;
  profile: ProfileRow | null;
};

async function fetchStats(userId: string): Promise<Stats> {
  const [
    { data: scores },
    { data: leaderboard },
    { data: profile },
    { data: mostPlayed },
    { data: minutesRows },
  ] = await Promise.all([
    supabase
      .from("scores")
      .select("id, game_type, points, played_at")
      .eq("user_id", userId)
      .order("played_at", { ascending: false })
      .limit(10),
    supabase.from("leaderboard").select("id, total_points, games_played"),
    supabase
      .from("profiles")
      .select("username, bio, custom_avatar_url, avatar_url, banner_url, country")
      .eq("id", userId)
      .single(),
    supabase.rpc("get_play_counts", { p_since: null }).limit(5),
    supabase.rpc("get_listening_minutes"),
  ]);

  const myRow = (leaderboard ?? []).find((r) => r.id === userId);
  const totalPoints =
    myRow?.total_points ?? (scores ?? []).reduce((sum, s) => sum + s.points, 0);
  const gamesPlayed = myRow?.games_played ?? (scores ?? []).length;
  const rankIdx = (leaderboard ?? []).findIndex((r) => r.id === userId);
  const rank = rankIdx >= 0 ? rankIdx + 1 : null;

  const m = (minutesRows as Record<string, string | number | null>[] | null)?.[0];

  return {
    totalPoints,
    gamesPlayed,
    rank,
    mostPlayed: (mostPlayed ?? []) as MostPlayed[],
    minutesTotal: Math.floor(Number(m?.total_ms ?? 0) / 60000),
    minutesWeek: Math.floor(Number(m?.week_ms ?? 0) / 60000),
    profile: (profile ?? null) as ProfileRow | null,
  };
}

export default function ProfileScreen() {
  const { session, signOut } = useSession();
  const user = session?.user;
  const userId = user?.id;

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);

  // Local overrides applied immediately after an edit so the UI updates without
  // a refetch (the stats refetch still happens in the background on pull).
  const [override, setOverride] = useState<{
    username: string;
    bio: string;
    avatarUrl: string | null;
    bannerUrl: string | null;
    country: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setStats(await fetchStats(userId));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      setStats(await fetchStats(userId));
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  const spotifyName =
    (user?.user_metadata?.full_name as string) ??
    (user?.user_metadata?.name as string) ??
    user?.email?.split("@")[0] ??
    "Player";
  const spotifyAvatar = user?.user_metadata?.avatar_url as string | undefined;

  const p = stats?.profile;
  const displayName = override?.username || p?.username || spotifyName;
  const bio = override?.bio ?? p?.bio ?? "";
  const avatarUrl =
    override?.avatarUrl ?? p?.custom_avatar_url ?? p?.avatar_url ?? spotifyAvatar ?? null;
  const bannerUrl = override?.bannerUrl ?? p?.banner_url ?? null;
  const country = override?.country ?? p?.country ?? null;

  const joined = user?.created_at
    ? new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(
        new Date(user.created_at),
      )
    : null;

  const statCards = [
    { label: "Points", value: (stats?.totalPoints ?? 0).toLocaleString("en") },
    { label: "Games", value: String(stats?.gamesPlayed ?? 0) },
    { label: "Rank", value: stats?.rank ? `#${stats.rank}` : "—" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlowBackground />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.mutedForeground}
          />
        }>
        {/* Hero banner */}
        <View style={{ height: 180 }}>
          {bannerUrl ? (
            <Image source={bannerUrl} style={{ width: "100%", height: "100%" }} contentFit="cover" />
          ) : (
            <LinearGradient
              colors={[colors.primary + "66", colors.primary + "1A", colors.background]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ width: "100%", height: "100%" }}
            />
          )}
          {/* fade into the page so the banner blends down */}
          <LinearGradient
            colors={["transparent", "transparent", colors.background]}
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 90 }}
          />
          {/* Edit pill */}
          <Pressable
            onPress={() => setEditing(true)}
            hitSlop={8}
            style={({ pressed }) => ({
              position: "absolute",
              top: 56,
              right: 16,
              transform: [{ scale: pressed ? 0.94 : 1 }],
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: "rgba(0,0,0,0.45)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.18)",
            })}>
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>✎ Edit</Text>
          </Pressable>
        </View>

        {/* Identity */}
        <Animated.View
          entering={FadeInDown.duration(500)}
          style={{ paddingHorizontal: 20, marginTop: -44 }}>
          {avatarUrl ? (
            <Image
              source={avatarUrl}
              style={{
                width: 92,
                height: 92,
                borderRadius: 999,
                borderWidth: 4,
                borderColor: colors.background,
              }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: 92,
                height: 92,
                borderRadius: 999,
                borderWidth: 4,
                borderColor: colors.background,
                backgroundColor: colors.primarySoft,
                alignItems: "center",
                justifyContent: "center",
              }}>
              <Text style={{ color: colors.primary, fontSize: 34, fontWeight: "800" }}>
                {displayName[0]?.toUpperCase()}
              </Text>
            </View>
          )}

          <View style={{ marginTop: 12, gap: 6 }}>
            <Text style={{ color: colors.foreground, fontSize: 24, fontWeight: "800" }}>
              {displayName}
            </Text>
            {bio ? (
              <Text style={{ color: colors.foreground, opacity: 0.85, fontSize: 14, lineHeight: 19 }}>
                {bio}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {country ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}>
                  <Image
                    source={flagUrl(country)}
                    style={{ width: 18, height: 13, borderRadius: 2 }}
                    contentFit="cover"
                  />
                  <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "500" }}>
                    {countryName(country)}
                  </Text>
                </View>
              ) : null}
              {joined ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                  Joined {joined}
                </Text>
              ) : null}
            </View>
          </View>
        </Animated.View>

        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <Animated.View
            entering={FadeInDown.delay(120).duration(500)}
            style={{ paddingHorizontal: 20, marginTop: 22, gap: 22 }}>
            {/* Stat cards */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              {statCards.map((s) => (
                <GlassCard
                  key={s.label}
                  radius={22}
                  style={{ flex: 1 }}
                  contentStyle={{
                    gap: 4,
                    paddingVertical: 16,
                    paddingHorizontal: 12,
                    alignItems: "center",
                  }}>
                  <Text
                    style={{ color: colors.primary, fontSize: 22, fontWeight: "800" }}
                    numberOfLines={1}
                    adjustsFontSizeToFit>
                    {s.value}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{s.label}</Text>
                </GlassCard>
              ))}
            </View>

            {/* Listening time */}
            {(stats?.minutesTotal ?? 0) > 0 ? (
              <GlassCard contentStyle={{ flexDirection: "row", padding: 18 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "800" }}>
                    {(stats?.minutesTotal ?? 0).toLocaleString("en")} min
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>All-time</Text>
                </View>
                <View style={{ width: 1, backgroundColor: "rgba(255,255,255,0.12)", marginHorizontal: 12 }} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "800" }}>
                    {(stats?.minutesWeek ?? 0).toLocaleString("en")} min
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>This week</Text>
                </View>
              </GlassCard>
            ) : null}

            {/* Favorite songs (Supabase) */}
            {userId ? <FavoriteSongs userId={userId} /> : null}

            {/* Most played */}
            {stats && stats.mostPlayed.length > 0 ? (
              <View style={{ gap: 12 }}>
                <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>
                  Your Most Played
                </Text>
                <GlassCard radius={22}>
                  {stats.mostPlayed.map((t, i) => (
                    <View
                      key={t.track_id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 11,
                        borderBottomWidth: i < stats.mostPlayed.length - 1 ? 1 : 0,
                        borderBottomColor: colors.border,
                      }}>
                      <Text
                        style={{
                          width: 18,
                          color: colors.mutedForeground,
                          fontSize: 13,
                          fontWeight: "700",
                        }}>
                        {i + 1}
                      </Text>
                      {t.album_art ? (
                        <Image
                          source={t.album_art}
                          style={{ width: 38, height: 38, borderRadius: 8 }}
                          contentFit="cover"
                        />
                      ) : (
                        <View
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 8,
                            backgroundColor: colors.cardElevated,
                            alignItems: "center",
                            justifyContent: "center",
                          }}>
                          <Text style={{ fontSize: 16 }}>🎵</Text>
                        </View>
                      )}
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text
                          numberOfLines={1}
                          style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
                          {t.name}
                        </Text>
                        {t.artists ? (
                          <Text
                            numberOfLines={1}
                            style={{ color: colors.mutedForeground, fontSize: 12 }}>
                            {t.artists}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>
                        {Number(t.play_count)}
                        <Text style={{ color: colors.mutedForeground, fontWeight: "400" }}>
                          {Number(t.play_count) === 1 ? " play" : " plays"}
                        </Text>
                      </Text>
                    </View>
                  ))}
                </GlassCard>
              </View>
            ) : null}

            {/* Spotify stats (Now Playing / Recently Played / Top …) */}
            <AnimatedSpotifyStats />

            {/* Sign out */}
            <Pressable
              onPress={signOut}
              style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}>
              <GlassCard radius={18} glow={false} contentStyle={{ paddingVertical: 15, alignItems: "center" }}>
                <Text style={{ color: colors.red, fontSize: 16, fontWeight: "600" }}>Sign out</Text>
              </GlassCard>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>

      {userId ? (
        <EditProfileSheet
          visible={editing}
          onClose={() => setEditing(false)}
          userId={userId}
          initial={{
            username: override?.username || p?.username || spotifyName,
            bio: override?.bio ?? p?.bio ?? "",
            avatarUrl,
            bannerUrl,
            country,
          }}
          onSaved={(data) => setOverride(data)}
        />
      ) : null}
    </View>
  );
}
