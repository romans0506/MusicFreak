import type { ViewStyle } from "react-native";

import { colors } from "@/theme/colors";

/**
 * Layered-matte surface system.
 *
 * Depth comes from TONE, not blur: every surface is opaque and sits one step
 * lighter than what's behind it. There is no frosted glass, no sheen, no rim
 * highlight — a card reads as raised because it is lighter and casts a soft,
 * crimson-tinted shadow, the way Apple Music and Linear do it. Every step
 * carries the ground's red hue — a neutral grey card on a scarlet page reads
 * as a foreign object.
 *
 * The ramp (never skip a step, never nest deeper than `raised`):
 *   base   #1A0E11  the page itself
 *   card   #241419  a card on the page
 *   raised #2E1A20  a tile/row sitting on a card
 *
 * Shadows are tinted with the crimson accent rather than neutral black —
 * a grey shadow on a warm dark page reads as dirt.
 */

/** Continuous ("squircle") corners — iOS renders these; Android falls back cleanly. */
const CONTINUOUS = { borderCurve: "continuous" } as const;

/** A card sitting directly on the page. The default surface. */
export const cardSurface: ViewStyle = {
  backgroundColor: colors.card,
  borderRadius: 22,
  ...CONTINUOUS,
  borderWidth: 1,
  borderColor: colors.border,
};

/** A tile or row sitting on top of a card — one tone lighter, no border. */
export const raisedSurface: ViewStyle = {
  backgroundColor: colors.cardElevated,
  borderRadius: 16,
  ...CONTINUOUS,
};

/**
 * Soft crimson drop shadow. Use on cards that sit on the page; skip it for
 * nested surfaces and dense lists, where stacked shadows turn to mud.
 */
export const softShadow: ViewStyle = {
  shadowColor: colors.primary,
  shadowOpacity: 0.18,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 6,
};

/** Accent-tinted surface for "earned"/active states (badges, favourited, you-row). */
export const accentSurface: ViewStyle = {
  backgroundColor: colors.primarySoft,
  borderRadius: 22,
  ...CONTINUOUS,
  borderWidth: 1,
  borderColor: "rgba(200,30,51,0.3)",
};
