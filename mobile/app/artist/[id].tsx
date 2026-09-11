import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PullRefreshScroll } from "@/components/pull-refresh";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useSession } from "@/lib/auth";
import { countryName, flagUrl } from "@/lib/countries";
import { getArtistEvents, type LiveEvent } from "@/lib/events";
import { getArtist, getArtistTopTracks, type ArtistFull, type TopTrack } from "@/lib/spotify";
import { supabase } from "@/lib/supabase";
import { colors, scrim } from "@/theme/colors";
import { typography } from "@/theme/type";
import { cardSurface } from "@/theme/surfaces";

// Mobile counterpart of the web /app/artists/[id] page. What each block needs:
//   header/genres/followers → GET /v1/artists/{id} (answers a user token), with
//     the name+image route params as an instant, always-available fallback
//   top tracks             → /me/top/tracks × 3 ranges, filtered (the artist
//                            top-tracks endpoint is deprecated → 403)
//   fans + favourite       → favorite_artists (public read, owner write)
//   game ranking           → get_name_song_leaderboard RPC (security definer)
// Deliberately dropped vs web: discography (needs an app token) and the
// "#1 artist in" country chips (needs artist photos from an app token).
//
// Layout: the artist photo IS the header — full-bleed, name set over it. A
// circular avatar floating on grey wastes the best image the screen has.

type Fan = {
  user_id: string;
  profiles: {
    username: string | null;
    avatar_url: string | null;
    custom_avatar_url: string | null;
  } | null;
};

type GameLeader = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  points: number;
};

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;

/** Dates shown before the "show all" expander. */
const EVENT_PREVIEW_COUNT = 5;

function avatarOf(p: Fan["profiles"]): string | null {
  return p?.custom_avatar_url ?? p?.avatar_url ?? null;
}

// Event dates are bare local "YYYY-MM-DD" strings. new Date() would treat them
// as UTC midnight and shift the day for anyone west of Greenwich, so read the
// parts off the string.
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function monthLabel(date: string) {
  return MONTHS[Number(date.slice(5, 7)) - 1] ?? "";
}

function dayLabel(date: string) {
  return String(Number(date.slice(8, 10)));
}

/** Year, shown only when the date isn't in the current one. */
function yearLabel(date: string) {
  const year = date.slice(0, 4);
  return year === String(new Date().getFullYear()) ? "" : year;
}

type SymbolName = Parameters<typeof IconSymbol>[0]["name"];

function Section({
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

export default function ArtistDetailScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string; image?: string }>();
  const artistId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  // Seeded from the route params so the header never renders empty.
  const [artist, setArtist] = useState<ArtistFull | null>(
    params.name
      ? {
          id: artistId,
          name: params.name,
          image: params.image || undefined,
          genres: [],
          popularity: 0,
          followers: 0,
        }
      : null,
  );
  const [tracks, setTracks] = useState<TopTrack[]>([]);
  const [fans, setFans] = useState<Fan[]>([]);
  const [leaders, setLeaders] = useState<GameLeader[]>([]);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!SPOTIFY_ID.test(artistId ?? "")) return;

    const [full, topTracks, fanRows, leaderRows] = await Promise.all([
      getArtist(artistId),
      getArtistTopTracks(artistId),
      supabase
        .from("favorite_artists")
        .select("user_id, profiles(username, avatar_url, custom_avatar_url)")
        .eq("artist_id", artistId)
        .limit(30),
      supabase.rpc("get_name_song_leaderboard", { p_artist_id: artistId }),
    ]);

    // Keep the seeded name/image if the token has aged out and `full` is null.
    if (full) setArtist(full);
    setTracks(topTracks);
    const fanList = (fanRows.data as unknown as Fan[]) ?? [];
    setFans(fanList);
    setFavorited(fanList.some((f) => f.user_id === userId));
    setLeaders((leaderRows.data as GameLeader[]) ?? []);
  }, [artistId, userId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Live dates key on the artist name, which is seeded from the route params
  // and so available on first paint — hence a separate fetch from load().
  // Failures leave `events` empty and the section doesn't render.
  const artistName = artist?.name ?? "";
  useEffect(() => {
    if (!artistName || !SPOTIFY_ID.test(artistId ?? "")) return;
    let alive = true;
    getArtistEvents(artistId, artistName).then((res) => {
      if (!alive) return;
      setEvents(res.events);
      setShowAllEvents(false);
    });
    return () => {
      alive = false;
    };
  }, [artistId, artistName]);

  const visibleEvents = showAllEvents ? events : events.slice(0, EVENT_PREVIEW_COUNT);

  // Pull-to-refresh path: `force` bypasses the module cache.
  const refreshEvents = useCallback(async () => {
    if (!artistName || !SPOTIFY_ID.test(artistId ?? "")) return;
    const res = await getArtistEvents(artistId, artistName, { force: true });
    setEvents(res.events);
  }, [artistId, artistName]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // `force` bypasses the events cache — a pull is the user telling us the
      // data looks wrong, so honouring a stale entry defeats the gesture.
      await Promise.all([load(), refreshEvents()]);
    } finally {
      setRefreshing(false);
    }
  }, [load, refreshEvents]);

  // Same rules as the web server action (favorite_artists is public-read and the
  // image is rendered for other users, so only https URLs are stored).
  const toggleFavorite = useCallback(async () => {
    if (!userId || !artist || saving) return;
    setSaving(true);
    const next = !favorited;
    setFavorited(next); // optimistic
    Haptics.impactAsync(
      next ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );

    try {
      if (next) {
        await supabase.from("favorite_artists").insert({
          user_id: userId,
          artist_id: artist.id,
          artist_name: artist.name.slice(0, 200),
          artist_image: artist.image?.startsWith("https://") ? artist.image.slice(0, 600) : null,
        });
      } else {
        await supabase
          .from("favorite_artists")
          .delete()
          .eq("user_id", userId)
          .eq("artist_id", artist.id);
      }
      await load();
    } catch {
      setFavorited(!next); // roll back
    } finally {
      setSaving(false);
    }
  }, [artist, favorited, load, saving, userId]);

  if (!SPOTIFY_ID.test(artistId ?? "")) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: 24,
        }}>
        <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "600" }}>
          Artist not found
        </Text>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "600" }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  // Square-ish crop: tall enough to feel like a poster, short enough to leave
  // the favourite button above the fold on a small phone.
  const heroHeight = Math.min(width * 0.95, 380);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Floating back button — this screen is headerless like the rest of the app */}
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={({ pressed }) => ({
          position: "absolute",
          top: insets.top + 8,
          left: 16,
          zIndex: 10,
          width: 38,
          height: 38,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: scrim(0.6),
          opacity: pressed ? 0.6 : 1,
        })}>
        <IconSymbol name="chevron.left" size={20} color={colors.foreground} />
      </Pressable>

      <PullRefreshScroll
        refreshing={refreshing}
        onRefresh={onRefresh}
        indicatorTop={insets.top + 8}
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingBottom: 32 }}>
        {/* ---------- Hero: the artist photo is the header ---------- */}
        <View style={{ height: heroHeight, justifyContent: "flex-end" }}>
          {artist?.image ? (
            <Animated.View entering={FadeIn.duration(500)} style={{ position: "absolute", inset: 0 }}>
              <Image
                source={artist.image}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
              <LinearGradient
                colors={[
                  scrim(0.55),
                  scrim(0.15),
                  scrim(0.85),
                  colors.background,
                ]}
                locations={[0, 0.35, 0.82, 1]}
                style={{ position: "absolute", inset: 0 }}
              />
            </Animated.View>
          ) : (
            <LinearGradient
              colors={["rgba(200,30,51,0.3)", colors.background]}
              style={{ position: "absolute", inset: 0 }}
            />
          )}

          <View style={{ paddingHorizontal: 20, paddingBottom: 18, gap: 6 }}>
            <Text
              numberOfLines={2}
              style={{ ...typography.heroTitle, color: colors.foreground }}>
              {artist?.name ?? "Artist"}
            </Text>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {artist && artist.followers > 0 ? (
                <Text
                  style={{
                    color: colors.foreground,
                    fontSize: 13,
                    fontWeight: "600",
                    fontVariant: ["tabular-nums"],
                  }}>
                  {artist.followers.toLocaleString("en")} followers
                </Text>
              ) : null}
              {artist?.genres?.length ? (
                <Text
                  numberOfLines={1}
                  style={{
                    color: colors.mutedForeground,
                    fontSize: 13,
                    textTransform: "capitalize",
                    flexShrink: 1,
                  }}>
                  {artist.followers > 0 ? "· " : ""}
                  {artist.genres.slice(0, 2).join(" · ")}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* ---------- Actions ---------- */}
        <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 20, marginTop: 4 }}>
          <Pressable
            onPress={toggleFavorite}
            disabled={saving}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 18,
              paddingVertical: 11,
              borderRadius: 999,
              backgroundColor: favorited ? colors.primary : colors.card,
              borderWidth: 1,
              borderColor: favorited ? colors.primary : colors.border,
              opacity: pressed || saving ? 0.75 : 1,
            })}>
            <IconSymbol
              name={favorited ? "heart.fill" : "heart"}
              size={16}
              color={favorited ? colors.primaryForeground : colors.foreground}
            />
            <Text
              style={{
                color: favorited ? colors.primaryForeground : colors.foreground,
                fontSize: 14,
                fontWeight: "700",
              }}>
              {favorited ? "Favorited" : "Favorite"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Linking.openURL(`https://open.spotify.com/artist/${artistId}`);
            }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 18,
              paddingVertical: 11,
              borderRadius: 999,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: pressed ? 0.75 : 1,
            })}>
            <View
              style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: colors.spotify }}
            />
            <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700" }}>
              Open in Spotify
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <View style={{ padding: 20, gap: 28, marginTop: 8 }}>
            {/* ---------- Your top tracks by this artist ---------- */}
            <Animated.View entering={FadeInDown.delay(80).duration(450)}>
              <Section icon="headphones" title="Your top tracks" />
              {tracks.length === 0 ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                  None of your top tracks are by this artist yet.
                </Text>
              ) : (
                <View>
                  {tracks.map((track, i) => (
                    <Pressable
                      key={track.id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        Linking.openURL(`https://open.spotify.com/track/${track.id}`);
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
                          width: 18,
                          color: i === 0 ? colors.primary : colors.mutedForeground,
                          fontSize: 13,
                          fontWeight: "700",
                          fontVariant: ["tabular-nums"],
                        }}>
                        {i + 1}
                      </Text>
                      {track.albumArt ? (
                        <Image
                          source={track.albumArt}
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
                      <View style={{ flex: 1 }}>
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
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </Animated.View>

            {/* ---------- Live dates (Ticketmaster) ---------- */}
            {events.length > 0 ? (
              <Animated.View entering={FadeInDown.delay(110).duration(450)}>
                <Section icon="calendar" title="Live dates" trailing="via Ticketmaster" />
                <View>
                  {visibleEvents.map((event, i) => (
                    <Pressable
                      key={event.id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        if (event.url) Linking.openURL(event.url);
                      }}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        paddingVertical: 10,
                        borderBottomWidth: i < visibleEvents.length - 1 ? 1 : 0,
                        borderBottomColor: colors.border,
                        opacity: pressed ? 0.6 : 1,
                      })}>
                      <View
                        style={{
                          width: 46,
                          height: 46,
                          borderRadius: 12,
                          borderCurve: "continuous",
                          backgroundColor: colors.primarySoft,
                          alignItems: "center",
                          justifyContent: "center",
                        }}>
                        <Text
                          style={{
                            color: colors.primary,
                            fontSize: 10,
                            fontWeight: "700",
                            letterSpacing: 0.6,
                          }}>
                          {monthLabel(event.date)}
                        </Text>
                        <Text
                          style={{
                            color: colors.foreground,
                            fontSize: 16,
                            fontWeight: "800",
                            fontVariant: ["tabular-nums"],
                          }}>
                          {dayLabel(event.date)}
                        </Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text
                          numberOfLines={1}
                          style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
                          {event.venue ?? event.name}
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          {event.country ? (
                            <Image
                              source={flagUrl(event.country)}
                              style={{ width: 16, height: 12, borderRadius: 2 }}
                              contentFit="cover"
                            />
                          ) : null}
                          <Text
                            numberOfLines={1}
                            style={{ color: colors.mutedForeground, fontSize: 12, flex: 1 }}>
                            {[event.city ?? countryName(event.country ?? ""), yearLabel(event.date)]
                              .filter(Boolean)
                              .join(" · ")}
                            {event.time ? ` · ${event.time.slice(0, 5)}` : ""}
                          </Text>
                        </View>
                      </View>
                      <IconSymbol name="ticket.fill" size={18} color={colors.primary} />
                    </Pressable>
                  ))}
                  {events.length > EVENT_PREVIEW_COUNT ? (
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowAllEvents((v) => !v);
                      }}
                      style={({ pressed }) => ({
                        ...cardSurface,
                        marginTop: 12,
                        borderRadius: 14,
                        paddingVertical: 12,
                        alignItems: "center",
                        opacity: pressed ? 0.6 : 1,
                      })}>
                      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
                        {showAllEvents ? "Show less" : `Show all ${events.length} dates`}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </Animated.View>
            ) : null}

            {/* ---------- Name That Song ranking for this artist ---------- */}
            {leaders.length > 0 ? (
              <Animated.View entering={FadeInDown.delay(140).duration(450)}>
                <Section icon="trophy.fill" title="Name That Song" trailing="best scores" />
                <View>
                  {leaders.slice(0, 10).map((leader, i) => {
                    const isMe = leader.user_id === userId;
                    return (
                      <View
                        key={leader.user_id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          paddingVertical: 9,
                          borderBottomWidth: i < Math.min(leaders.length, 10) - 1 ? 1 : 0,
                          borderBottomColor: colors.border,
                        }}>
                        <Text
                          style={{
                            width: 22,
                            color: i === 0 ? colors.primary : colors.mutedForeground,
                            fontSize: 13,
                            fontWeight: "700",
                            fontVariant: ["tabular-nums"],
                          }}>
                          {i + 1}
                        </Text>
                        {leader.avatar_url ? (
                          <Image
                            source={leader.avatar_url}
                            style={{ width: 32, height: 32, borderRadius: 999 }}
                            contentFit="cover"
                          />
                        ) : (
                          <View
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 999,
                              backgroundColor: colors.cardElevated,
                              alignItems: "center",
                              justifyContent: "center",
                            }}>
                            <Text
                              style={{ color: colors.foreground, fontSize: 13, fontWeight: "700" }}>
                              {(leader.username ?? "?")[0]?.toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <Text
                          numberOfLines={1}
                          style={{
                            flex: 1,
                            color: isMe ? colors.primary : colors.foreground,
                            fontSize: 14,
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
                            fontSize: 14,
                            fontWeight: "800",
                            fontVariant: ["tabular-nums"],
                          }}>
                          {Number(leader.points).toLocaleString("en")}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Animated.View>
            ) : null}

            {/* ---------- Fans — who else favourited this artist ---------- */}
            <Animated.View entering={FadeInDown.delay(200).duration(450)}>
              <Section
                icon="person.2.fill"
                title="Fans on MusicFreak"
                trailing={fans.length > 0 ? String(fans.length) : undefined}
              />
              {fans.length === 0 ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                  No one has favorited this artist yet. Be the first.
                </Text>
              ) : (
                <View
                  style={{ ...cardSurface, padding: 16, flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
                  {fans.map((fan) => {
                    const avatar = avatarOf(fan.profiles);
                    const name = fan.profiles?.username ?? "Anonymous";
                    return (
                      <View key={fan.user_id} style={{ alignItems: "center", gap: 5, width: 60 }}>
                        {avatar ? (
                          <Image
                            source={avatar}
                            style={{ width: 44, height: 44, borderRadius: 999 }}
                            contentFit="cover"
                          />
                        ) : (
                          <View
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 999,
                              backgroundColor: colors.cardElevated,
                              alignItems: "center",
                              justifyContent: "center",
                            }}>
                            <Text
                              style={{ color: colors.foreground, fontSize: 16, fontWeight: "700" }}>
                              {name[0]?.toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <Text
                          numberOfLines={1}
                          style={{ color: colors.mutedForeground, fontSize: 11, textAlign: "center" }}>
                          {name}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </Animated.View>
          </View>
        )}
      </PullRefreshScroll>
    </View>
  );
}
