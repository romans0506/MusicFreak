import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  FadeInRight,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";

import { ArtistPicker } from "@/components/artist-picker";
import { GameHeader } from "@/components/game-header";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { buildNameSongRounds, saveScore, type GameArtist, type NameSongRound } from "@/lib/games";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/type";
import { cardSurface, softShadow } from "@/theme/surfaces";

/**
 * Name That Song — mobile port of the web src/components/name-song-game.tsx.
 * Pick an artist, hear five seconds, name the track.
 *
 * Both the song list and the audio come from iTunes (lib/itunes.ts), which is
 * what makes this game portable at all: Spotify's preview_url is null on almost
 * everything now, and the device has no app token for the catalogue anyway. One
 * source for both also means the clip always matches the four labels under it.
 *
 * Audio is expo-audio. A single player is kept for the whole run and re-pointed
 * at each round with `replace()` — creating one per round leaks native players
 * and drops the first second while the next one warms up. The 5s window is armed
 * off the *status*, not off calling play(), so a slow buffer eats into nothing:
 * the clip is five seconds of audio, not five seconds of waiting.
 *
 * Deliberately different from web: the artist grid is the shared ArtistPicker
 * (web keeps its own inline copy), and picking is iTunes-first — see the header
 * of components/artist-picker.tsx for why the device can't search Spotify.
 */

/** Seconds to answer. Matches the web version. */
const WINDOW = 12;
const MAX_POINTS = 150;
const CLIP_MS = 5000;
const REVEAL_MS = 1800;

type GameState = "pick" | "countdown" | "loading" | "round" | "reveal" | "end" | "error";

type Leader = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  points: number;
};

function calcPoints(timeLeft: number) {
  return Math.round(MAX_POINTS * (timeLeft / WINDOW));
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const HERO = 168;
const HERO_R = 78;
const HERO_C = 2 * Math.PI * HERO_R;

/** The artist photo with the answer window draining around it. */
function ClipRing({
  running,
  danger,
  roundKey,
  children,
}: {
  running: boolean;
  danger: boolean;
  roundKey: string;
  children: React.ReactNode;
}) {
  const progress = useSharedValue(1);

  useEffect(() => {
    // On reveal, freeze the ring where the answer stopped it. Resetting it to
    // full here — or letting the timing animation run on underneath — would
    // both read as the clock lying about what just happened.
    if (!running) {
      cancelAnimation(progress);
      return;
    }
    progress.value = 1;
    progress.value = withTiming(0, { duration: WINDOW * 1000, easing: Easing.linear });
  }, [roundKey, running, progress]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: HERO_C * (1 - progress.value),
  }));

  return (
    <View style={{ width: HERO, height: HERO, alignItems: "center", justifyContent: "center" }}>
      <Svg
        width={HERO}
        height={HERO}
        style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle
          cx={HERO / 2}
          cy={HERO / 2}
          r={HERO_R}
          fill="none"
          strokeWidth={4}
          stroke={colors.cardElevated}
        />
        <AnimatedCircle
          cx={HERO / 2}
          cy={HERO / 2}
          r={HERO_R}
          fill="none"
          strokeWidth={4}
          strokeLinecap="round"
          stroke={danger ? colors.red : colors.primary}
          strokeDasharray={HERO_C}
          animatedProps={ringProps}
        />
      </Svg>
      {children}
    </View>
  );
}

/** Animated "now playing" bars. There's no replay — you hear the clip once. */
function Equalizer({ active }: { active: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 18 }}>
      {[0, 1, 2, 3].map((i) => (
        <EqualizerBar key={i} active={active} delay={i * 120} />
      ))}
    </View>
  );
}

function EqualizerBar({ active, delay }: { active: boolean; delay: number }) {
  const height = useSharedValue(6);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!active || reduceMotion) {
      height.value = withTiming(6, { duration: 200 });
      return;
    }
    height.value = withRepeat(
      withTiming(18, { duration: 460 + delay, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [active, delay, height, reduceMotion]);

  const animated = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Animated.View
      style={[{ width: 3, borderRadius: 2, backgroundColor: colors.primary }, animated]}
    />
  );
}

function ArtistImage({ artist, size }: { artist: GameArtist | null; size: number }) {
  if (artist?.image) {
    return (
      <Image
        source={{ uri: artist.image }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        transition={250}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.cardElevated,
        alignItems: "center",
        justifyContent: "center",
      }}>
      <Text style={{ ...typography.hero, fontSize: size / 2.6, color: colors.mutedForeground }}>
        {artist?.name?.[0]?.toUpperCase()}
      </Text>
    </View>
  );
}

export default function NameSongGame({
  onBack,
  userId,
}: {
  onBack: () => void;
  userId: string | null;
}) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<GameState>("pick");
  const [artist, setArtist] = useState<GameArtist | null>(null);
  const [rounds, setRounds] = useState<NameSongRound[]>([]);
  const [current, setCurrent] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(WINDOW);
  const [points, setPoints] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [leaders, setLeaders] = useState<Leader[]>([]);

  // "Get ready" 3-2-1 between picking an artist and the first round; the rounds
  // load in the background during it, so the wait reads as intentional. Both
  // sides are mirrored into refs because tryStart() below is called from
  // callbacks that would otherwise close over stale values.
  const [readyCount, setReadyCount] = useState(3);
  const readyRef = useRef(3);
  const fetchedRef = useRef<NameSongRound[] | "error" | null>(null);
  /** Bumped per run, so a superseded fetch can tell it lost. */
  const runId = useRef(0);

  // The clip for the round in play, handed to the hook as its source rather
  // than pushed in later with player.replace(). replace() on a player the hook
  // built with a null source throws "Exception in HostFunction"; letting the
  // hook own the source is the documented path and it releases the previous
  // native player for us, so a run doesn't accumulate them either.
  //
  // Every round is a different track (songsForArtist de-dupes by title), and
  // between runs this goes null and back, so each player is freshly at 0:00 and
  // nothing needs seeking before it plays.
  const activeClip =
    state === "round" || state === "reveal" ? (rounds[current]?.previewUrl ?? null) : null;
  const player = useAudioPlayer(activeClip, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);

  // See the note in multiple-choice-game.tsx: the interval reads the clock from
  // a ref so ending the round isn't a setState from inside a setState updater.
  const timeRef = useRef(WINDOW);
  const countdown = useRef<ReturnType<typeof setInterval> | null>(null);
  const clipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Whether this round's 5s window has already been armed off the status. */
  const armed = useRef(false);
  const saved = useRef(false);

  // Clips must be audible with the ringer switch off, and must not play under
  // whatever the phone is already playing — half-hearing the real track behind
  // the clip would give the answer away.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "doNotMix" }).catch(() => {});
  }, []);

  const clearTimers = useCallback(() => {
    if (countdown.current) clearInterval(countdown.current);
    if (clipTimer.current) clearTimeout(clipTimer.current);
    countdown.current = null;
    clipTimer.current = null;
  }, []);

  const goToReveal = useCallback(
    (chosenIndex: number | null, remaining: number) => {
      clearTimers();
      player.pause();
      const round = rounds[current];
      if (!round) return;

      const correct = chosenIndex === round.correctIndex;
      const pts = correct ? calcPoints(remaining) : 0;
      Haptics.notificationAsync(
        correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
      );
      setChosen(chosenIndex);
      if (correct) {
        setPoints((p) => p + pts);
        setCorrectCount((c) => c + 1);
      }
      setState("reveal");

      advance.current = setTimeout(() => {
        if (current + 1 >= rounds.length) {
          setState("end");
        } else {
          setCurrent((c) => c + 1);
          setChosen(null);
          timeRef.current = WINDOW;
          setTimeLeft(WINDOW);
          setState("round");
        }
      }, REVEAL_MS);
    },
    [clearTimers, current, player, rounds],
  );

  // Each round: start the clip and the answer countdown. The player already
  // holds this round's source (see activeClip above); the 5s stop is armed
  // separately, once playback actually reports as running.
  useEffect(() => {
    if (state !== "round" || !rounds[current]) return;

    armed.current = false;
    player.play();

    countdown.current = setInterval(() => {
      timeRef.current = Math.max(0, timeRef.current - 1);
      setTimeLeft(timeRef.current);
      if (timeRef.current === 0) goToReveal(null, 0);
    }, 1000);

    return clearTimers;
  }, [state, current, rounds, player, goToReveal, clearTimers]);

  // Arm the 5s window off the first status tick that says we're playing — not
  // off calling play(), which returns long before a remote clip is buffered.
  useEffect(() => {
    if (state !== "round" || armed.current || !status.playing) return;
    armed.current = true;
    clipTimer.current = setTimeout(() => player.pause(), CLIP_MS);
  }, [state, status.playing, player]);

  // Leaving mid-round must not leave a timer firing into an unmounted screen.
  // (The player itself is released for us by useAudioPlayer.)
  useEffect(() => {
    return () => {
      if (countdown.current) clearInterval(countdown.current);
      if (clipTimer.current) clearTimeout(clipTimer.current);
      if (advance.current) clearTimeout(advance.current);
    };
  }, []);

  /**
   * Two things gate the first round — the 3-2-1 finishing and the rounds
   * arriving — and either can be last. Both call this; whoever loses the race
   * finds the other's result already in a ref and moves the game on. Keeping it
   * a function rather than an effect over two pieces of state is what stops the
   * "countdown → loading → round" hop from being a chain of cascading renders.
   */
  const tryStart = useCallback(() => {
    if (readyRef.current > 0) return; // still counting down
    const built = fetchedRef.current;
    if (built === null) setState("loading"); // countdown won; hold on a spinner
    else if (built === "error") setState("error");
    else {
      setRounds(built);
      setState("round");
    }
  }, []);

  const startGame = useCallback(
    async (pick: GameArtist) => {
      // Backing out mid-fetch and picking someone else must not let the old
      // request start a round for the wrong artist.
      const run = ++runId.current;
      fetchedRef.current = null;
      readyRef.current = 3;

      setArtist(pick);
      setCurrent(0);
      setChosen(null);
      timeRef.current = WINDOW;
      setTimeLeft(WINDOW);
      setPoints(0);
      setCorrectCount(0);
      setLeaders([]);
      setReadyCount(3);
      saved.current = false;
      setState("countdown");

      const built = await buildNameSongRounds(pick.name).catch(() => []);
      if (run !== runId.current) return;
      fetchedRef.current = built.length > 0 ? built : "error";
      tryStart();
    },
    [tryStart],
  );

  // Tick the get-ready countdown 3 → 0, then hand over to tryStart.
  useEffect(() => {
    if (state !== "countdown" || readyCount <= 0) return;
    const t = setTimeout(() => {
      readyRef.current = Math.max(0, readyCount - 1);
      setReadyCount(readyRef.current);
      if (readyRef.current === 0) tryStart();
    }, 1000);
    return () => clearTimeout(t);
  }, [state, readyCount, tryStart]);

  // On game end: persist the score, then load this artist's leaderboard.
  useEffect(() => {
    if (state !== "end" || saved.current) return;
    saved.current = true;
    let cancelled = false;

    (async () => {
      await saveScore("guess-second", points, artist);
      // Only Spotify-backed artists have a board — see saveScore's note.
      if (!artist?.spotifyId || cancelled) return;
      const { data } = await supabase.rpc("get_name_song_leaderboard", {
        p_artist_id: artist.spotifyId,
      });
      if (!cancelled) setLeaders((data as Leader[]) ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [state, points, artist]);

  // ── Pick an artist ──
  if (state === "pick") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <GameHeader onBack={onBack} />
        <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: insets.bottom }}>
          <Animated.View entering={FadeInDown.duration(450)} style={{ marginBottom: 22 }}>
            <Text style={{ ...typography.screenTitle, color: colors.foreground }}>
              Name That Song
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 15, marginTop: 6 }}>
              Pick an artist — then name the track from five seconds of it.
            </Text>
          </Animated.View>
          <ArtistPicker onPick={startGame} />
        </View>
      </View>
    );
  }

  // ── Get ready ──
  if (state === "countdown") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <GameHeader onBack={onBack} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 22 }}>
          <ArtistImage artist={artist} size={150} />
          <Text style={{ ...typography.section, fontSize: 19, color: colors.foreground }}>
            {artist?.name}
          </Text>
          <Animated.Text
            key={readyCount}
            entering={FadeIn.duration(280)}
            style={{ ...typography.hero, fontSize: 80, color: colors.primary }}>
            {readyCount > 0 ? readyCount : "Go!"}
          </Animated.Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>Get ready…</Text>
        </View>
      </View>
    );
  }

  // ── Rounds still loading after the countdown ran out ──
  if (state === "loading") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <GameHeader onBack={onBack} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={{ color: colors.mutedForeground, fontSize: 15 }}>Preparing clips…</Text>
        </View>
      </View>
    );
  }

  // ── Couldn't build a round ──
  if (state === "error") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <GameHeader onBack={onBack} />
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
          <IconSymbol name="headphones" size={40} color={colors.mutedForeground} />
          <Text style={{ ...typography.section, color: colors.foreground, textAlign: "center" }}>
            No clips for {artist?.name}
          </Text>
          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: 14,
              textAlign: "center",
              lineHeight: 20,
            }}>
            We couldn&apos;t find enough playable previews for them. Try another artist.
          </Text>
          <Pressable onPress={() => setState("pick")} hitSlop={10} style={{ marginTop: 6 }}>
            <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "600" }}>
              Pick another artist
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Final score ──
  if (state === "end") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <GameHeader onBack={onBack} />
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 32,
            alignItems: "center",
          }}>
          <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: "center" }}>
            <ArtistImage artist={artist} size={112} />
            <Text style={{ ...typography.eyebrow, color: colors.mutedForeground, marginTop: 22 }}>
              Final score
            </Text>
            <Text style={{ ...typography.hero, color: colors.primary, marginTop: 2 }}>{points}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 14, marginTop: 4 }}>
              {correctCount}/{rounds.length} correct · {artist?.name}
            </Text>
          </Animated.View>

          {leaders.length > 0 ? (
            <View style={{ width: "100%", marginTop: 28 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 12,
                }}>
                <IconSymbol name="trophy.fill" size={16} color={colors.primary} />
                <Text style={{ ...typography.section, color: colors.foreground }}>
                  Top players · {artist?.name}
                </Text>
              </View>
              <View style={{ ...cardSurface, overflow: "hidden" }}>
                {leaders.slice(0, 10).map((l, i, shown) => {
                  const isMe = l.user_id === userId;
                  const name = l.username ?? "Anonymous";
                  return (
                    <View
                      key={l.user_id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        backgroundColor: isMe ? colors.primarySoft : "transparent",
                        borderBottomWidth: i < shown.length - 1 ? 1 : 0,
                        borderBottomColor: colors.border,
                      }}>
                      <Text
                        style={{
                          ...typography.figureSmall,
                          width: 18,
                          color: i === 0 ? colors.primary : colors.mutedForeground,
                        }}>
                        {i + 1}
                      </Text>
                      {l.avatar_url ? (
                        <Image
                          source={{ uri: l.avatar_url }}
                          style={{ width: 28, height: 28, borderRadius: 14 }}
                          contentFit="cover"
                        />
                      ) : (
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            backgroundColor: colors.cardElevated,
                            alignItems: "center",
                            justifyContent: "center",
                          }}>
                          <Text style={{ ...typography.figureSmall, color: colors.mutedForeground }}>
                            {name[0]?.toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <Text
                        numberOfLines={1}
                        style={{ flex: 1, color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
                        {name}
                        {isMe ? <Text style={{ color: colors.primary }}> (you)</Text> : null}
                      </Text>
                      <Text style={{ ...typography.figureSmall, color: colors.primary }}>
                        {l.points}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={{ width: "100%", gap: 10, marginTop: 24 }}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                if (artist) startGame(artist);
              }}
              style={({ pressed }) => ({
                ...softShadow,
                backgroundColor: pressed ? "#a81829" : colors.primary,
                borderRadius: 999,
                paddingVertical: 16,
                alignItems: "center",
              })}>
              <Text style={{ ...typography.section, color: colors.primaryForeground }}>
                Play again
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setState("pick")}
              style={({ pressed }) => ({
                backgroundColor: pressed ? colors.cardPressed : colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 999,
                paddingVertical: 15,
                alignItems: "center",
              })}>
              <Text style={{ ...typography.section, color: colors.foreground }}>New artist</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Playing ──
  const round = rounds[current];
  if (!round) return null;
  const answered = state === "reveal";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GameHeader
        onBack={onBack}
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ ...typography.figureSmall, color: colors.mutedForeground }}>
              {current + 1}/{rounds.length}
            </Text>
            <View
              style={{
                flex: 1,
                height: 5,
                borderRadius: 3,
                backgroundColor: colors.cardElevated,
                overflow: "hidden",
              }}>
              <View
                style={{
                  width: `${((current + (answered ? 1 : 0)) / rounds.length) * 100}%`,
                  height: "100%",
                  borderRadius: 3,
                  backgroundColor: colors.primary,
                }}
              />
            </View>
            <Text style={{ ...typography.figureSmall, color: colors.primary }}>{points}</Text>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}>
        <Animated.View key={round.id} entering={FadeInRight.duration(280)}>
          <View
            style={{
              ...cardSurface,
              paddingVertical: 24,
              alignItems: "center",
              gap: 16,
              marginTop: 6,
            }}>
            <ClipRing
              running={state === "round"}
              danger={timeLeft <= 4}
              roundKey={round.id}>
              <ArtistImage artist={artist} size={HERO - 24} />
            </ClipRing>
            <Text style={{ ...typography.section, color: colors.foreground }}>{artist?.name}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Equalizer active={state === "round" && status.playing} />
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                {state === "round" && !status.playing ? "Loading clip…" : "Now playing…"}
              </Text>
              <Text
                style={{
                  ...typography.figureSmall,
                  color: timeLeft <= 4 ? colors.red : colors.mutedForeground,
                }}>
                {timeLeft}s
              </Text>
            </View>
          </View>

          <View style={{ gap: 10, marginTop: 16 }}>
            {round.options.map((option, i) => {
              const isChosen = chosen === i;
              const isCorrect = i === round.correctIndex;

              let background: string = colors.card;
              let border: string = colors.border;
              let text: string = colors.foreground;
              if (answered) {
                if (isCorrect) {
                  background = "rgba(52,208,88,0.12)";
                  border = "rgba(52,208,88,0.5)";
                  text = colors.green;
                } else if (isChosen) {
                  background = "rgba(239,68,68,0.12)";
                  border = "rgba(239,68,68,0.5)";
                  text = colors.red;
                } else {
                  text = colors.mutedForeground;
                }
              }

              return (
                <Pressable
                  key={i}
                  disabled={answered}
                  onPress={() => goToReveal(i, timeLeft)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    borderRadius: 16,
                    borderCurve: "continuous",
                    borderWidth: 1,
                    borderColor: border,
                    backgroundColor: pressed && !answered ? colors.cardPressed : background,
                    padding: 10,
                    opacity: answered && !isCorrect && !isChosen ? 0.45 : 1,
                    transform: [{ scale: pressed && !answered ? 0.985 : 1 }],
                  })}>
                  {option.albumArt ? (
                    <Image
                      source={{ uri: option.albumArt }}
                      style={{ width: 44, height: 44, borderRadius: 10 }}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        backgroundColor: colors.cardElevated,
                        alignItems: "center",
                        justifyContent: "center",
                      }}>
                      <IconSymbol name="music.note" size={18} color={colors.mutedForeground} />
                    </View>
                  )}
                  <Text
                    numberOfLines={2}
                    style={{ flex: 1, color: text, fontSize: 15, fontWeight: "600" }}>
                    {option.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
