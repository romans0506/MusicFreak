import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";

import { GlowBackground } from "@/components/glow-background";
import { useSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/colors";

type Leader = {
  id: string;
  username: string | null;
  total_points: number;
  avatar_url: string | null;
};

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

// Mirrors the web /app/leaderboard page: the `leaderboard` view (top 50 by
// total_points) joined with profiles for avatars (custom avatar wins over
// Spotify). All reads go straight to the shared Supabase project.
async function fetchLeaders(): Promise<Leader[]> {
  const { data: leaders } = await supabase
    .from("leaderboard")
    .select("id, username, total_points")
    .limit(50);

  const ids = (leaders ?? []).map((l) => l.id);
  const { data: profiles } = ids.length
    ? await supabase
        .from("profiles")
        .select("id, avatar_url, custom_avatar_url")
        .in("id", ids)
    : { data: [] };

  const avatarById = new Map(
    (profiles ?? []).map((p) => [p.id, p.custom_avatar_url ?? p.avatar_url ?? null]),
  );

  return (leaders ?? []).map((l) => ({
    ...l,
    avatar_url: avatarById.get(l.id) ?? null,
  }));
}

export default function LeaderboardScreen() {
  const { session } = useSession();
  const currentUserId = session?.user?.id ?? null;

  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setLeaders(await fetchLeaders());
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
      setLeaders(await fetchLeaders());
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlowBackground />
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 20, gap: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.mutedForeground}
          />
        }>
        <Animated.View entering={FadeInDown.duration(500)} style={{ gap: 6, marginBottom: 4 }}>
          <Text style={{ color: colors.foreground, fontSize: 34, fontWeight: "800", letterSpacing: -0.5 }}>
            Leaderboard
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 15 }}>
            Top players by total points
          </Text>
        </Animated.View>

      {loading ? (
        <View style={{ paddingVertical: 80, alignItems: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : leaders.length === 0 ? (
        <View
          style={{
            alignItems: "center",
            gap: 8,
            paddingVertical: 80,
            backgroundColor: colors.card,
            borderRadius: 22,
            borderCurve: "continuous",
            borderWidth: 1,
            borderColor: colors.border,
          }}>
          <Text style={{ fontSize: 34 }}>🏆</Text>
          <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "600" }}>
            No scores yet
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
            Be the first to play and claim the top spot.
          </Text>
        </View>
      ) : (
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 22,
            borderCurve: "continuous",
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
          }}>
          {leaders.map((leader, i) => {
            const rank = i + 1;
            const isMe = leader.id === currentUserId;
            const top3 = rank <= 3;
            return (
              <Animated.View
                key={leader.id}
                entering={FadeInDown.delay(Math.min(i, 12) * 35).duration(400)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  paddingHorizontal: 16,
                  paddingVertical: 13,
                  borderBottomWidth: i < leaders.length - 1 ? 1 : 0,
                  borderBottomColor: colors.border,
                  backgroundColor: isMe ? colors.primarySoft : "transparent",
                }}>
                <View style={{ width: 30, alignItems: "center" }}>
                  {MEDAL[rank] ? (
                    <Text style={{ fontSize: 18 }}>{MEDAL[rank]}</Text>
                  ) : (
                    <Text
                      style={{
                        color: colors.mutedForeground,
                        fontSize: 13,
                        fontWeight: "600",
                      }}>
                      #{rank}
                    </Text>
                  )}
                </View>

                {leader.avatar_url ? (
                  <Image
                    source={leader.avatar_url}
                    style={{ width: 38, height: 38, borderRadius: 999 }}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 999,
                      backgroundColor: colors.cardElevated,
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                    <Text
                      style={{
                        color: colors.foreground,
                        fontSize: 15,
                        fontWeight: "700",
                      }}>
                      {(leader.username ?? "?")[0]?.toUpperCase()}
                    </Text>
                  </View>
                )}

                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    color: isMe ? colors.primary : colors.foreground,
                    fontSize: 15,
                    fontWeight: "600",
                  }}>
                  {leader.username ?? "Anonymous"}
                  {isMe ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                      {"  (you)"}
                    </Text>
                  ) : null}
                </Text>

                <Text
                  style={{
                    color: top3 ? colors.primary : colors.foreground,
                    fontSize: 15,
                    fontWeight: "800",
                    fontVariant: ["tabular-nums"],
                  }}>
                  {leader.total_points.toLocaleString("en")} pts
                </Text>
              </Animated.View>
            );
          })}
        </View>
      )}
      </ScrollView>
    </View>
  );
}
