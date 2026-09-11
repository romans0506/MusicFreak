import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";

import { colors } from "@/theme/colors";

/**
 * "Freak" — the app mascot, peering over an edge with both fists gripping it:
 * bandana'd head in a backwards snapback, shades on. Rap-cover styling, drawn
 * as one dark shape.
 *
 * The pose is built for the pull-to-refresh panel, where his feet-line sits
 * exactly on the top edge of the page — the fingers run off the bottom of the
 * viewBox so they read as wrapped over that edge. Keep the bottom flush if you
 * reuse him.
 *
 * Vectors rather than a PNG so it stays crisp at any size. Every tone is in the
 * black family, separated only by luminance and lifted just far enough off
 * `background` (#1A0E11) to read on it — that's what keeps him a silhouette
 * rather than a cartoon at 64pt. The shades and mouth are the only colour —
 * which is why the padlock below is drawn in the black family too, even though
 * an accent lock would be louder.
 *
 * `mood` and `lock` exist for the Stats period pager, where a period with no
 * plays gets a sad Freak and a period you haven't reached yet gets him holding
 * a padlock. Both keep the same gripping pose, so he still needs an edge to
 * hang from — see components/mascot-note.tsx.
 */

const BODY = "#2c2c32"; // head, ears, hands, arms
const CROWN = "#202024"; // the cap, darker than the head so it sits on top
const BAND = "#17171b"; // headband, brim, knuckles — the darkest edge
const BANDANA = "#45454f"; // lightest, so the strip across the forehead reads

export function Mascot({
  size = 64,
  accent = colors.primary,
  mood = "deadpan",
  lock = false,
}: {
  size?: number;
  /** Shades and mouth — the only colour on him. */
  accent?: string;
  /** "sad" turns the deadpan line into a frown. */
  mood?: "deadpan" | "sad";
  /** Draws a padlock hanging between his fists, on the edge he's gripping. */
  lock?: boolean;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Arms and fists first, so the head covers where they meet the shoulder. */}
      <Path d="M22 84 L31 68" stroke={BODY} strokeWidth={9} strokeLinecap="round" fill="none" />
      <Path d="M78 84 L69 68" stroke={BODY} strokeWidth={9} strokeLinecap="round" fill="none" />
      <Path d="M11 85 Q11 78 18 78 L25 78 Q32 78 32 85 L32 100 L11 100 Z" fill={BODY} />
      <Path d="M68 85 Q68 78 75 78 L82 78 Q89 78 89 85 L89 100 L68 100 Z" fill={BODY} />
      {/* Knuckle splits — the fingers run off the bottom, over the edge. */}
      <Rect x={17.6} y={88} width={1.6} height={12} fill={BAND} />
      <Rect x={24.6} y={88} width={1.6} height={12} fill={BAND} />
      <Rect x={74.6} y={88} width={1.6} height={12} fill={BAND} />
      <Rect x={81.6} y={88} width={1.6} height={12} fill={BAND} />

      {/* Brim poking out behind the head — the giveaway that the cap is on backwards. */}
      <Ellipse cx={74} cy={40} rx={16} ry={7} fill={BAND} transform="rotate(-14 74 40)" />

      {/* Bandana tail, hanging out from under the cap. */}
      <Path d="M28 53 L13 63 L18 69 L30 60 Z" fill={BANDANA} />

      <Circle cx={25} cy={63} r={4.5} fill={BODY} />
      <Circle cx={75} cy={63} r={4.5} fill={BODY} />
      <Circle cx={50} cy={60} r={25.5} fill={BODY} />

      {/* Bandana across the forehead, following the skull. */}
      <Path
        d="M26 47 L74 47 C75 51 75.4 55 75.4 58 C68 64 32 64 24.6 58 C24.6 55 25 51 26 47 Z"
        fill={BANDANA}
      />

      {/* Crown + headband, worn over the bandana. */}
      <Path d="M24 47 C24 30 36 20 50 20 C64 20 76 30 76 47 Z" fill={CROWN} />
      <Rect x={22.5} y={41.5} width={55} height={7.5} rx={3.75} fill={BAND} />

      {/* The snapback closure sits at the front when the cap is reversed — the
          bandana shows through the gap. */}
      <Rect x={44} y={39} width={12} height={10} rx={2} fill={BANDANA} />
      <Rect x={44} y={42} width={12} height={4} rx={2} fill={BAND} />

      <Rect x={29} y={63} width={18} height={11} rx={4} fill={accent} />
      <Rect x={53} y={63} width={18} height={11} rx={4} fill={accent} />
      <Rect x={46.5} y={66} width={7} height={3.5} rx={1.75} fill={accent} />
      {/* Deadpan, not a grin — or an actual frown when there's nothing to report. */}
      {mood === "sad" ? (
        <Path
          d="M43.5 82.5 Q50 76.5 56.5 82.5"
          stroke={accent}
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <Path d="M45 81 L57 78" stroke={accent} strokeWidth={3} strokeLinecap="round" fill="none" />
      )}

      {/* Padlock, in the gap between his fists and below the jaw. Its body runs
          to the bottom of the viewBox so it sits on the same edge his fingers
          wrap over, rather than floating. */}
      {lock ? (
        <>
          <Path
            d="M45 92 V88 A5 5 0 0 1 55 88 V92"
            stroke={BANDANA}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
          />
          <Rect x={41} y={91} width={18} height={11} rx={3} fill={BAND} />
          <Circle cx={50} cy={96} r={2} fill={BANDANA} />
        </>
      ) : null}
    </Svg>
  );
}
