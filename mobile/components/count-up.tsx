import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Text, type StyleProp, type TextStyle } from "react-native";

type Props = {
  /** Final value to land on. */
  value: number;
  /** Renders the in-between values — e.g. ms → "14h 22m". */
  format: (n: number) => string;
  durationMs?: number;
  style?: StyleProp<TextStyle>;
};

// Ease-out cubic: fast off the mark, settles gently. A linear count reads
// mechanical; this reads like the number is arriving.
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Counts a number up on mount.
 *
 * Deliberately its own component: it re-renders every animation frame, and the
 * Stats screen it lives on is expensive to render. Isolating it here means only
 * this Text node updates, not the whole screen.
 *
 * Honours the OS "Reduce Motion" setting by rendering the final value directly.
 */
export function CountUp({ value, format, durationMs = 900, style }: Props) {
  const [display, setDisplay] = useState(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return;
      if (reduceMotion || value === 0) {
        setDisplay(value);
        return;
      }

      const start = Date.now();
      const tick = () => {
        const elapsed = Date.now() - start;
        const t = Math.min(1, elapsed / durationMs);
        setDisplay(Math.round(value * easeOut(t)));
        if (t < 1) frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value, durationMs]);

  // Tabular figures stop the number jittering as digits change width mid-count.
  return <Text style={[{ fontVariant: ["tabular-nums"] }, style]}>{format(display)}</Text>;
}
