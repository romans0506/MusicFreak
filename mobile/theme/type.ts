import type { TextStyle } from "react-native";

/**
 * Type system.
 *
 * Two families, one job each:
 *   display — Manrope, for headings, hero numbers and any figure the eye lands
 *             on. Chosen for its numerals: they're even-width and tall-x-height,
 *             which is what a screen full of listening stats needs.
 *   body    — the OS font (San Francisco on iOS, Roboto on Android). Nothing
 *             beats the system face for small running text, and it costs no
 *             download.
 *
 * Load the display family once in app/_layout.tsx via useFonts.
 */
export const fonts = {
  display: "Manrope_800ExtraBold",
  displayMedium: "Manrope_600SemiBold",
} as const;

/** Tabular figures — stops numbers jittering as digits change. */
const TABULAR: TextStyle = { fontVariant: ["tabular-nums"] };

export const typography = {
  /** Screen titles: "Listening Stats", "Your Artists". */
  screenTitle: {
    fontFamily: fonts.display,
    fontSize: 34,
    letterSpacing: -0.8,
  } as TextStyle,

  /** The one number per screen. */
  hero: {
    fontFamily: fonts.display,
    fontSize: 64,
    letterSpacing: -2.5,
    lineHeight: 68,
    ...TABULAR,
  } as TextStyle,

  /** Artist name over the hero artwork. */
  heroTitle: {
    fontFamily: fonts.display,
    fontSize: 40,
    letterSpacing: -1.2,
    lineHeight: 44,
  } as TextStyle,

  /** Section headings: "Badges", "When you listen". */
  section: {
    fontFamily: fonts.displayMedium,
    fontSize: 17,
    letterSpacing: -0.2,
  } as TextStyle,

  /** Numbers inside cards and rows. */
  figure: {
    fontFamily: fonts.display,
    fontSize: 21,
    letterSpacing: -0.4,
    ...TABULAR,
  } as TextStyle,

  /** Small numbers in list rows (rank, play count). */
  figureSmall: {
    fontFamily: fonts.displayMedium,
    fontSize: 14,
    ...TABULAR,
  } as TextStyle,

  /** Uppercase micro-label above a hero number. */
  eyebrow: {
    fontFamily: fonts.displayMedium,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  } as TextStyle,
} as const;
