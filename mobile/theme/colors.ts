/**
 * MusicFreak dark-scarlet palette. Dark-only by design.
 *
 * The ground is a red-black rather than neutral grey, and the hue lives in the
 * surfaces instead of in gradients painted over a grey page. Every step of the
 * ramp carries the same hue so a card never looks grey on red; muted text and
 * borders are warmed for the same reason.
 *
 * Note: this does not mirror src/app/globals.css — the web app is still
 * neutral grey.
 */
export const colors = {
  background: "#1A0E11",
  card: "#241419",
  cardElevated: "#2E1A20",
  /** Pressed/active fill — one step above `cardElevated`, still matte. */
  cardPressed: "#382128",
  foreground: "#F5F0F1",
  mutedForeground: "#9A8E90",
  primary: "#c81e33", // dark crimson — the only accent
  primaryForeground: "#fff5f5",
  primarySoft: "rgba(200,30,51,0.15)",
  border: "rgba(255,225,230,0.10)",
  spotify: "#1DB954",
  green: "#34d058",
  red: "#ef4444",
} as const;

/**
 * `background` as rgba, for image scrims that fade into the page. Use this
 * rather than a literal so scrims can't drift from the palette.
 */
export function scrim(alpha: number): string {
  return `rgba(26,14,17,${alpha})`;
}
