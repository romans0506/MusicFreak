import { useCallback, useEffect, useRef, useState } from "react";
import { View, type ScrollViewProps } from "react-native";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Mascot } from "@/components/mascot";
import { colors } from "@/theme/colors";

/**
 * Snapchat-style pull to refresh: dragging down slides the whole page away and
 * the mascot is hanging off its top edge, fists gripping it, riding the page
 * down. Fingers first, then the shades, then the whole of him.
 *
 * Why not `RefreshControl`: its indicator is drawn by the platform, so it can't
 * be this.
 *
 * The page is displaced by us rather than by the scroll view's own overscroll,
 * which is what makes this work identically on Android (no bounce there) and
 * lets the panel stay open while the request runs. That costs iOS its rubber
 * band — hence `bounces={false}`; the pull below replaces it at the top.
 *
 * The loop while loading is the one looping animation outside the mini-player:
 * it's tied to an in-flight request, and `useReducedMotion()` stills it.
 */

const MASCOT = 64;
/**
 * Rubber band: near 1:1 with the finger, asymptotic only once you're well past
 * the trigger. Low values here made the drag feel long and heavy.
 */
const DAMP = 650;
/** A cached refresh can return in 100ms; hold the page so it doesn't blink. */
const MIN_SHOW = 450;
/** Slightly over-damped on purpose — settling has to read as arriving, not bouncing. */
const OPEN = { damping: 28, stiffness: 260, mass: 0.7 };
const CLOSE = { duration: 240, easing: Easing.out(Easing.cubic) };

type Props = ScrollViewProps & {
  refreshing: boolean;
  onRefresh: () => void;
  /**
   * Where the mascot's head starts inside the panel — pass `insets.top + 8` so
   * he clears the status bar.
   */
  indicatorTop?: number;
};

export function PullRefreshScroll({
  refreshing,
  onRefresh,
  indicatorTop = 12,
  children,
  ...scrollProps
}: Props) {
  // The page parks far enough down to clear all of him, but arms well before
  // that — about a third of him showing. Waiting for the whole mascot made the
  // drag twice as long as it needed to be; now the release pulls the rest of
  // him up, which is the better beat anyway.
  const rest = indicatorTop + MASCOT + 6;
  const threshold = rest - 40;
  const maxPull = rest + 64;

  const reducedMotion = useReducedMotion();
  /** `refreshing`, stretched to at least MIN_SHOW. Drives everything visual. */
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(0);

  const pull = useSharedValue(0);
  const atTop = useSharedValue(true);
  const armed = useSharedValue(false);
  /** Translation at the moment the drag reached the top — see `onUpdate`. */
  const baseline = useSharedValue(0);
  /** 0 → 1 while the request is in flight. Blends the pose, never the position. */
  const active = useSharedValue(0);
  const bob = useSharedValue(0.5);
  /** Set when the release already animated the page open, so `busy` doesn't redo it. */
  const opened = useSharedValue(false);

  const onScroll = useAnimatedScrollHandler((e) => {
    atTop.value = e.contentOffset.y <= 2;
  });

  const tick = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  // The scroll view's own gesture, so the pull can run alongside it instead of
  // stealing the drag.
  const nativeScroll = Gesture.Native();

  const pan = Gesture.Pan()
    .enabled(!busy)
    // Downward drags only, and bail out on horizontal ones so the carousels
    // inside these screens still swipe.
    .activeOffsetY(14)
    .failOffsetX([-16, 16])
    .simultaneousWithExternalGesture(nativeScroll)
    .onBegin(() => {
      baseline.value = 0;
    })
    .onUpdate((e) => {
      if (!atTop.value) {
        // Flicking up to the top inside one drag shouldn't count the distance
        // already spent scrolling — the pull starts from wherever we got here.
        baseline.value = e.translationY;
        pull.value = 0;
        armed.value = false;
        return;
      }
      const t = Math.max(0, e.translationY - baseline.value);
      pull.value = Math.min(DAMP * (1 - Math.exp(-t / DAMP)), maxPull);
      if (pull.value >= threshold && !armed.value) {
        armed.value = true;
        runOnJS(tick)();
      } else if (pull.value < threshold && armed.value) {
        armed.value = false;
      }
    })
    .onEnd(() => {
      if (armed.value) runOnJS(onRefresh)();
    })
    .onFinalize(() => {
      // One animation owns the position from here on — the old version ran this
      // spring and a second one for the parked state, and the two fought.
      if (armed.value) {
        opened.value = true;
        pull.value = withSpring(rest, OPEN);
      } else {
        pull.value = withTiming(0, CLOSE);
      }
      armed.value = false;
    });

  useEffect(() => {
    if (refreshing) {
      startedAt.current = Date.now();
      setBusy(true);
      return;
    }
    if (!busy) return;
    const wait = Math.max(0, MIN_SHOW - (Date.now() - startedAt.current));
    const timer = setTimeout(() => setBusy(false), wait);
    return () => clearTimeout(timer);
  }, [refreshing, busy]);

  useEffect(() => {
    if (busy) {
      // Normally the release already opened it; this only covers a refresh
      // started some other way.
      if (!opened.value) pull.value = withSpring(rest, OPEN);
      active.value = withTiming(1, { duration: 220 });
      if (!reducedMotion) {
        bob.value = withRepeat(
          withTiming(1, { duration: 620, easing: Easing.inOut(Easing.quad) }),
          -1,
          true,
        );
      }
    } else {
      opened.value = false;
      pull.value = withTiming(0, CLOSE);
      active.value = withTiming(0, { duration: 200 });
      cancelAnimation(bob);
      bob.value = withTiming(0.5, { duration: 200 });
    }
  }, [busy, reducedMotion, rest, active, bob, opened, pull]);

  /** `pull` is the only thing that moves the page — see `onFinalize`. */
  const travel = useDerivedValue(() => pull.value);

  /**
   * A fixed-height slab parked above the screen, slid down by `travel`. It
   * covers whatever the screen paints behind the page (the profile's glow, say)
   * and carries the mascot on its bottom edge, which is exactly the page's top
   * edge. Sliding beats animating `height`: no layout pass per frame.
   */
  const panelHeight = maxPull + indicatorTop + MASCOT + 40;
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: travel.value - panelHeight }],
  }));

  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: travel.value }],
  }));

  const mascotStyle = useAnimatedStyle(() => {
    const held = active.value;
    // Leans when you overpull, sways while it waits — pivoting on his grip
    // rather than his middle, so his hands stay planted on the edge.
    const tilt =
      interpolate(travel.value, [rest, maxPull], [0, 6], Extrapolation.CLAMP) * (1 - held) +
      interpolate(bob.value, [0, 1], [-5, 5]) * held;

    return {
      transform: [
        { translateY: MASCOT / 2 },
        { rotate: `${tilt}deg` },
        { translateY: -MASCOT / 2 },
      ],
    };
  });

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: panelHeight,
            backgroundColor: colors.background,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "flex-end",
          },
          panelStyle,
        ]}>
        {/* Last child of a flex-end slab: his fingers land on the page's edge. */}
        <Animated.View style={mascotStyle}>
          <Mascot size={MASCOT} />
        </Animated.View>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flex: 1 }, pageStyle]}>
          <GestureDetector gesture={nativeScroll}>
            <Animated.ScrollView
              onScroll={onScroll}
              scrollEventThrottle={16}
              {...scrollProps}
              bounces={false}
              overScrollMode="never">
              {children}
            </Animated.ScrollView>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
