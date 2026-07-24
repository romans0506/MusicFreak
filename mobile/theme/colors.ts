/**
 * MusicFreak dark crimson palette — mirrors the web app's tokens
 * (src/app/globals.css). Dark-only by design.
 */
export const colors = {
  background: "#121212",
  card: "#1c1c1e",
  cardElevated: "#242427",
  foreground: "#f5f5f5",
  mutedForeground: "#8e8e93",
  primary: "#c81e33", // ≈ oklch(0.50 0.22 18) — dark crimson
  primaryForeground: "#fff5f5",
  primarySoft: "rgba(200,30,51,0.15)",
  border: "rgba(255,255,255,0.10)",
  spotify: "#1DB954",
  green: "#34d058",
  red: "#ef4444",
} as const;
