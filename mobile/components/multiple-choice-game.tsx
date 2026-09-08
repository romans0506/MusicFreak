import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
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

import { GameHeader } from "@/components/game-header";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { saveScore, type GameType, type Question } from "@/lib/games";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/type";
import { cardSurface, raisedSurface, softShadow } from "@/theme/surfaces";

/**
 * The gameplay engine shared by Music Quiz and Lyric → Song — the mobile twin
 * of the web app's src/components/multiple-choice-game.tsx, and the same deal:
 * to add another multiple-choice game, write a `load` that returns Question[]
 * and point a screen at this component. Don't fork it.
 *
 * One structural difference from web. There, config carries an `endpoint` the
 * component fetches; the device has no API layer, so config carries a `load()`
 * function instead (see lib/games.ts). That also drops the web version's
 * server-component workaround of passing the icon as a string key — a screen
 * here is just a client component, so it hands over a real icon name.
 *
 * Layout is rebuilt for the phone rather than transcribed: options are one
 * full-width column, not a 2×2 grid, because song titles are long and a
 * thumb-height row is the target you actually want to hit under a timer.
 */

type SymbolName = Parameters<typeof IconSymbol>[0]["name"];

const TOTAL_TIME = 15;
const MAX_POINTS_PER_Q = 150;
/** How long the right/wrong answer stays on screen before the next question. */
const REVEAL_MS = 1500;

export type QuizConfig = {
  /** Heading on the start/end screens. */
  title: string;
  /** One-line description on the start screen. */
  subtitle: string;
  /** scores.game_type value to persist. */
  gameType: GameType;
  /** Builds one round. Return an empty array to show the error screen. */
  load: () => Promise<Question[]>;
  icon: SymbolName;
  /** Accent for the icon tile and start button glow. */
  tint: string;
  /** Lines shown in the start-screen rules list. */
  rules?: string[];
  /** Message under the error screen. */
  errorHint?: string;
  /** Line under the spinner — say what's slow, e.g. "Fetching lyrics". */
  loadingHint?: string;
  /** When a question has no image, show a styled "?" tile instead of nothing. */
  imagePlaceholder?: boolean;
};

type GameState = "start" | "loading" | "error" | "question" | "answer" | "end";

type AnswerRecord = { question: Question; correct: boolean; points: number };

function calcPoints(timeLeft: number) {
  return Math.round(MAX_POINTS_PER_Q * (timeLeft / TOTAL_TIME));
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_R = 19;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Circular countdown: the seconds digit inside a ring that depletes. The ring
 * is driven by a shared value rather than the React state that renders the
 * digit, so it sweeps smoothly instead of stepping once a second.
 */
function CircleTimer({ timeLeft }: { timeLeft: number }) {
  const progress = useSharedValue(1);
  const danger = timeLeft <= 5;

  useEffect(() => {
    progress.value = withTiming(Math.max(timeLeft / TOTAL_TIME, 0), {
      duration: 950,
      easing: Easing.linear,
    });
  }, [timeLeft, progress]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_C * (1 - progress.value),
  }));

  return (
    <View style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
      <Svg width={44} height={44} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={22} cy={22} r={RING_R} fill="none" strokeWidth={3} stroke={colors.cardElevated} />
        <AnimatedCircle
          cx={22}
          cy={22}
          r={RING_R}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          stroke={danger ? colors.red : colors.primary}
          strokeDasharray={RING_C}
          animatedProps={ringProps}
        />
      </Svg>
      <Text
        style={{
          ...typography.figureSmall,
          fontSize: 15,
          color: danger ? colors.red : colors.foreground,
        }}>
        {timeLeft}
      </Text>
    </View>
  );
}

export default function MultipleChoiceGame({
  config,
  onBack,
}: {
  config: QuizConfig;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<GameState>("start");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME);
  const [chosen, setChosen] = useState<number | null>(null);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);

  // The clock lives in a ref as well as state: the interval needs to read the
  // current value and decide to end the question, and doing that inside a
  // setTimeLeft updater would mean calling setState during a render.
  const timeRef = useRef(TOTAL_TIME);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved = useRef(false);

  const totalPoints = answers.reduce((s, a) => s + a.points, 0);

  const stopTimer = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const goToAnswer = useCallback(
    (chosenIndex: number | null, remaining: number) => {
      stopTimer();
      const q = questions[current];
      if (!q) return;
      const correct = chosenIndex === q.correctIndex;
      const pts = correct ? calcPoints(remaining) : 0;

      Haptics.notificationAsync(
        correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
      );
      setChosen(chosenIndex);
      setState("answer");
      setAnswers((prev) => [...prev, { question: q, correct, points: pts }]);

      advance.current = setTimeout(() => {
        if (current + 1 >= questions.length) {
          setState("end");
        } else {
          setCurrent((c) => c + 1);
          setChosen(null);
          timeRef.current = TOTAL_TIME;
          setTimeLeft(TOTAL_TIME);
          setState("question");
        }
      }, REVEAL_MS);
    },
    [current, questions, stopTimer],
  );

  // One interval per question. Running out is just an unanswered answer.
  useEffect(() => {
    if (state !== "question") return;
    timer.current = setInterval(() => {
      timeRef.current = Math.max(0, timeRef.current - 1);
      setTimeLeft(timeRef.current);
      if (timeRef.current === 0) goToAnswer(null, 0);
    }, 1000);
    return stopTimer;
  }, [state, current, goToAnswer, stopTimer]);

  // Leaving mid-round must not leave a timer firing into an unmounted screen.
  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
      if (advance.current) clearTimeout(advance.current);
    };
  }, []);

  const startGame = useCallback(async () => {
    setState("loading");
    setAnswers([]);
    setCurrent(0);
    timeRef.current = TOTAL_TIME;
    setTimeLeft(TOTAL_TIME);
    setChosen(null);
    saved.current = false;

    try {
      const built = await config.load();
      // A short round is still a round; only nothing at all is a failure.
      if (built.length < 3) {
        setState("error");
        return;
      }
      setQuestions(built);
      setState("question");
    } catch {
      setState("error");
    }
  }, [config]);

  // Persist once per run — the effect can re-fire, an inserted row can't be undone.
  useEffect(() => {
    if (state !== "end" || saved.current) return;
    saved.current = true;
    saveScore(config.gameType, totalPoints);
  }, [state, totalPoints, config.gameType]);

  // ── Start ──
  if (state === "start") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <GameHeader onBack={onBack} />
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 32,
            alignItems: "center",
          }}>
          <Animated.View entering={FadeInDown.duration(500)} style={{ alignItems: "center" }}>
            <View
              style={{
                width: 104,
                height: 104,
                borderRadius: 32,
                borderCurve: "continuous",
                backgroundColor: config.tint + "26",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 24,
                shadowColor: config.tint,
                shadowOpacity: 0.35,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 10 },
                elevation: 8,
              }}>
              <IconSymbol name={config.icon} size={48} color={config.tint} />
            </View>

            <Text
              style={{
                ...typography.screenTitle,
                color: colors.foreground,
                marginTop: 26,
                textAlign: "center",
              }}>
              {config.title}
            </Text>
            <Text
              style={{
                color: colors.mutedForeground,
                fontSize: 15,
                marginTop: 8,
                textAlign: "center",
              }}>
              {config.subtitle}
            </Text>
          </Animated.View>

          <View style={{ width: "100%", gap: 10, marginTop: 30 }}>
            {(config.rules ?? []).map((rule, i) => (
              <Animated.View
                key={rule}
                entering={FadeInDown.delay(120 + i * 80).duration(450)}
                style={{ ...raisedSurface, paddingVertical: 15, paddingHorizontal: 18 }}>
                <Text style={{ color: colors.foreground, fontSize: 15, textAlign: "center" }}>
                  {rule}
                </Text>
              </Animated.View>
            ))}
          </View>

          <Animated.View
            entering={FadeInDown.delay(120 + (config.rules?.length ?? 0) * 80).duration(450)}
            style={{ width: "100%", marginTop: 30 }}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                startGame();
              }}
              style={({ pressed }) => ({
                ...softShadow,
                backgroundColor: pressed ? "#a81829" : colors.primary,
                borderRadius: 999,
                paddingVertical: 17,
                alignItems: "center",
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}>
              <Text
                style={{
                  ...typography.section,
                  fontSize: 18,
                  color: colors.primaryForeground,
                }}>
                Start
              </Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </View>
    );
  }

  // ── Loading ──
  if (state === "loading") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <GameHeader onBack={onBack} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
          <PulsingIcon icon={config.icon} tint={config.tint} />
          <Text style={{ ...typography.section, color: colors.foreground, marginTop: 8 }}>
            Building your round…
          </Text>
          {config.loadingHint ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: "center" }}>
              {config.loadingHint}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  // ── Error ──
  if (state === "error") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <GameHeader onBack={onBack} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
          <IconSymbol name={config.icon} size={40} color={colors.mutedForeground} />
          <Text style={{ ...typography.section, color: colors.foreground }}>
            Couldn&apos;t start this game
          </Text>
          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: 14,
              textAlign: "center",
              lineHeight: 20,
            }}>
            {config.errorHint ?? "Something went wrong. Please try again."}
          </Text>
          <Pressable onPress={() => setState("start")} hitSlop={10} style={{ marginTop: 6 }}>
            <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "600" }}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── End ──
  if (state === "end") {
    const correct = answers.filter((a) => a.correct).length;
    const percent = questions.length ? Math.round((correct / questions.length) * 100) : 0;
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <GameHeader onBack={onBack} />
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 32,
            alignItems: "center",
          }}>
          <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: "center", marginTop: 12 }}>
            <View
              style={{
                width: 74,
                height: 74,
                borderRadius: 26,
                borderCurve: "continuous",
                backgroundColor: colors.primarySoft,
                alignItems: "center",
                justifyContent: "center",
              }}>
              <IconSymbol name="trophy.fill" size={34} color={colors.primary} />
            </View>
            <Text style={{ ...typography.eyebrow, color: colors.mutedForeground, marginTop: 22 }}>
              Final score
            </Text>
            <Text style={{ ...typography.hero, color: colors.primary, marginTop: 2 }}>
              {totalPoints}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 14, marginTop: 4 }}>
              {correct}/{questions.length} correct · {percent}%
            </Text>
          </Animated.View>

          <View style={{ ...cardSurface, width: "100%", marginTop: 26, overflow: "hidden" }}>
            {answers.map((a, i) => (
              <View
                key={a.question.id + i}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderBottomWidth: i < answers.length - 1 ? 1 : 0,
                  borderBottomColor: colors.border,
                }}>
                <IconSymbol
                  name={a.correct ? "checkmark" : "xmark"}
                  size={16}
                  color={a.correct ? colors.green : colors.red}
                />
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, color: colors.mutedForeground, fontSize: 13 }}>
                  {a.question.question.replace(/\n/g, " ")}
                </Text>
                <Text
                  style={{
                    ...typography.figureSmall,
                    color: a.correct ? colors.green : colors.mutedForeground,
                  }}>
                  +{a.points}
                </Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              startGame();
            }}
            style={({ pressed }) => ({
              marginTop: 22,
              width: "100%",
              borderRadius: 999,
              paddingVertical: 15,
              alignItems: "center",
              backgroundColor: pressed ? colors.cardPressed : colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            })}>
            <Text style={{ ...typography.section, color: colors.foreground }}>Play again</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ── Question / answer ──
  const q = questions[current];
  if (!q) return null;
  const answered = state === "answer";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GameHeader
        onBack={onBack}
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ ...typography.figureSmall, color: colors.mutedForeground }}>
              {current + 1}/{questions.length}
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
                  width: `${((current + (answered ? 1 : 0)) / questions.length) * 100}%`,
                  height: "100%",
                  borderRadius: 3,
                  backgroundColor: colors.primary,
                }}
              />
            </View>
            <CircleTimer timeLeft={timeLeft} />
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}>
        <Animated.View key={q.id} entering={FadeInRight.duration(280)}>
          <View
            style={{
              ...cardSurface,
              paddingVertical: 26,
              paddingHorizontal: 20,
              alignItems: "center",
              marginTop: 6,
            }}>
            {config.imagePlaceholder && !q.image ? (
              <View
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 20,
                  borderCurve: "continuous",
                  backgroundColor: colors.primarySoft,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 18,
                }}>
                <Text style={{ ...typography.hero, fontSize: 38, lineHeight: 44, color: colors.primary }}>
                  ?
                </Text>
              </View>
            ) : null}
            <Text
              style={{
                ...typography.section,
                fontSize: 20,
                lineHeight: 28,
                color: colors.foreground,
                textAlign: "center",
              }}>
              {q.question}
            </Text>
            {q.hint ? (
              <Text
                style={{
                  color: colors.mutedForeground,
                  fontSize: 13,
                  marginTop: 10,
                  textAlign: "center",
                }}>
                {q.hint}
              </Text>
            ) : null}
          </View>

          <View style={{ gap: 10, marginTop: 16 }}>
            {q.options.map((option, i) => {
              const isChosen = chosen === i;
              const isCorrect = i === q.correctIndex;

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
                  onPress={() => goToAnswer(i, timeLeft)}
                  style={({ pressed }) => ({
                    borderRadius: 16,
                    borderCurve: "continuous",
                    borderWidth: 1,
                    borderColor: border,
                    backgroundColor: pressed && !answered ? colors.cardPressed : background,
                    paddingVertical: 16,
                    paddingHorizontal: 18,
                    opacity: answered && !isCorrect && !isChosen ? 0.45 : 1,
                    transform: [{ scale: pressed && !answered ? 0.985 : 1 }],
                  })}>
                  <Text style={{ color: text, fontSize: 15, fontWeight: "600" }}>{option}</Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

/**
 * The loading state's stand-in for a spinner: the game's own icon breathing.
 * Building a lyric round means ~35 lrclib lookups through a 5-wide pool, which
 * genuinely takes a few seconds — worth dressing properly.
 */
function PulsingIcon({ icon, tint }: { icon: SymbolName; tint: string }) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    scale.value = withRepeat(
      withTiming(1.12, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      -1, // forever
      true, // reverse — a breathe, not a sawtooth
    );
  }, [scale, reduceMotion]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[
        {
          width: 72,
          height: 72,
          borderRadius: 24,
          borderCurve: "continuous",
          backgroundColor: tint + "26",
          alignItems: "center",
          justifyContent: "center",
        },
        animated,
      ]}>
      <IconSymbol name={icon} size={32} color={tint} />
    </Animated.View>
  );
}
