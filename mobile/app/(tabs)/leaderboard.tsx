import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Skeleton, SkeletonRow } from "@/components/skeleton";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/type";

type Leader = {
  id: string;
  username: string | null;
  total_points: number;
  avatar_url: string | null;
};

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
    ? await supabase.from("profiles").select("id, avatar_url, custom_avatar_url").in("id", ids)
    : { data: [] };

  const avatarById = new Map(
    (profiles ?? []).map((p) => [p.id, p.custom_avatar_url ?? p.avatar_url ?? null]),
  );

  return (leaders ?? []).map((l) => ({
    ...l,
    avatar_url: avatarById.get(l.id) ?? null,
  }));
}

function Avatar({
  uri,
  name,
  size,
  ring,
}: {
  uri: string | null;
  name: string | null;
  size: number;
  ring?: string;
}) {
  const common = {
    width: size,
    height: size,
    borderRadius: 999,
    borderWidth: ring ? 2 : 0,
    borderColor: ring ?? "transparent",
  } as const;

  if (uri) return <Image source={uri} style={common} contentFit="cover" />;
  return (
    <View
      style={{
        ...common,
        backgroundColor: colors.cardElevated,
        alignItems: "center",
        justifyContent: "center",
      }}>
      <Text style={{ color: colors.foreground, fontSize: size * 0.38, fontWeight: "700" }}>
        {(name ?? "?")[0]?.toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * The top three as an actual podium. Rank is carried by height and scale, so
 * the eye gets it before reading a single number — a flat 1/2/3 list makes the
 * winner look like everyone else.
 */
function Podium({ top, currentUserId }: { top: Leader[]; currentUserId: string | null }) {
  // Visual order is 2nd, 1st, 3rd — the winner stands in the middle.
  const order = [top[1], top[0], top[2]];
  const heights = [70, 104, 52];
  const avatars = [56, 74, 50];

  return (
    <Animated.View
      entering={FadeIn.duration(500)}
      style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 20 }}>
      {order.map((leader, i) => {
        if (!leader) return <View key={i} style={{ flex: 1 }} />;
        const rank = i === 0 ? 2 : i === 1 ? 1 : 3;
        const isWinner = rank === 1;
        const isMe = leader.id === currentUserId;

        return (
          <View key={leader.id} style={{ flex: 1, alignItems: "center", gap: 8 }}>
            <Avatar
              uri={leader.avatar_url}
              name={leader.username}
              size={avatars[i]}
              ring={isWinner ? colors.primary : colors.border}
            />
            <Text
              numberOfLines={1}
              style={{
                color: isMe ? colors.primary : colors.foreground,
                fontSize: isWinner ? 14 : 13,
                fontWeight: "700",
                maxWidth: "100%",
              }}>
              {leader.username ?? "Anonymous"}
            </Text>
            <Text
              style={{
                color: colors.mutedForeground,
                fontSize: 12,
                fontVariant: ["tabular-nums"],
              }}>
              {leader.total_points.toLocaleString("en")}
            </Text>

            {/* The block itself */}
            <View
              style={{
                width: "100%",
                height: heights[i],
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderCurve: "continuous",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isWinner ? colors.primary : colors.cardElevated,
              }}>
              <Text
                style={{
                  color: isWinner ? colors.primaryForeground : colors.mutedForeground,
                  fontSize: isWinner ? 26 : 20,
                  fontWeight: "800",
                  fontVariant: ["tabular-nums"],
                }}>
                {rank}
              </Text>
            </View>
          </View>
        );
      })}
    </Animated.View>
  );
}

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
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

  const top = leaders.slice(0, 3);
  const rest = leaders.slice(3);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 8 }}>
        <View style={{ paddingHorizontal: 20, marginBottom: 28 }}>
          <Skeleton width={200} height={32} radius={8} />
        </View>
        {/* podium shape: short, tall, shortest */}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 20 }}>
          {[70, 104, 52].map((h, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center", gap: 8 }}>
              <Skeleton width={i === 1 ? 74 : 54} height={i === 1 ? 74 : 54} radius={999} />
              <Skeleton width="70%" height={11} radius={4} />
              <Skeleton width="100%" height={h} radius={12} />
            </View>
          ))}
        </View>
        <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} artworkRadius={999} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.mutedForeground}
            progressViewOffset={insets.top}
          />
        }>
        <View style={{ paddingHorizontal: 20, marginBottom: 28 }}>
          <Text
            style={{ ...typography.screenTitle, color: colors.foreground }}>
            Leaderboard
          </Text>
        </View>

        {leaders.length === 0 ? (
          <View style={{ alignItems: "center", gap: 8, paddingVertical: 70, paddingHorizontal: 40 }}>
            <IconSymbol name="trophy.fill" size={30} color={colors.mutedForeground} />
            <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "600" }}>
              No scores yet
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: "center" }}>
              Be the first to play and claim the top spot.
            </Text>
          </View>
        ) : (
          <>
            <Podium top={top} currentUserId={currentUserId} />

            {rest.length > 0 ? (
              <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
                {rest.map((leader, i) => {
                  const rank = i + 4;
                  const isMe = leader.id === currentUserId;
                  return (
                    <Animated.View
                      key={leader.id}
                      entering={FadeInDown.delay(Math.min(i, 12) * 35).duration(400)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 14,
                        paddingVertical: 11,
                        borderBottomWidth: i < rest.length - 1 ? 1 : 0,
                        borderBottomColor: colors.border,
                      }}>
                      <Text
                        style={{
                          width: 26,
                          color: colors.mutedForeground,
                          fontSize: 13,
                          fontWeight: "600",
                          fontVariant: ["tabular-nums"],
                        }}>
                        {rank}
                      </Text>

                      <Avatar uri={leader.avatar_url} name={leader.username} size={38} />

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
                            {"  you"}
                          </Text>
                        ) : null}
                      </Text>

                      <Text
                        style={{
                          color: colors.foreground,
                          fontSize: 15,
                          fontWeight: "700",
                          fontVariant: ["tabular-nums"],
                        }}>
                        {leader.total_points.toLocaleString("en")}
                      </Text>
                    </Animated.View>
                  );
                })}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
