// Pure listening-stats helpers (no React, no I/O) so they're easy to reason about.
//
// PORT of the web app's src/lib/stats.ts — kept byte-identical in behaviour so
// a streak or badge never disagrees between web and mobile. There is no shared
// package between the two projects, so if you change one, change the other.

/** Days since the Unix epoch for a YYYY-MM-DD string, for gap math. */
function dayNumber(isoDay: string): number {
  return Math.floor(Date.parse(`${isoDay}T00:00:00Z`) / 86_400_000);
}

/**
 * Current + longest listening streak from a list of distinct play-days.
 * `daysDesc` is "YYYY-MM-DD" strings, newest first. The current streak counts
 * only if the newest day is today or yesterday (so a missed day breaks it).
 */
export function computeStreak(
  daysDesc: string[],
  todayIso: string,
): { current: number; longest: number } {
  if (daysDesc.length === 0) return { current: 0, longest: 0 };

  const nums = daysDesc.map(dayNumber);
  const today = dayNumber(todayIso);

  // Current streak
  let current = 0;
  if (nums[0] === today || nums[0] === today - 1) {
    current = 1;
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] === nums[i - 1] - 1) current++;
      else break;
    }
  }

  // Longest streak
  let longest = 1;
  let run = 1;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === nums[i - 1] - 1) run++;
    else run = 1;
    if (run > longest) longest = run;
  }

  return { current, longest };
}

export type BadgeId =
  | "first-play"
  | "century"
  | "explorer"
  | "dedicated"
  | "night-owl"
  | "superfan";

export type Badge = {
  id: BadgeId;
  label: string;
  description: string;
  earned: boolean;
};

export type BadgeInputs = {
  totalPlays: number;
  uniqueTracks: number;
  currentStreak: number;
  hasNightPlay: boolean;
  favoriteArtistCount: number;
};

/** Resolve the full badge set (earned + not-yet) from already-computed stats. */
export function computeBadges(i: BadgeInputs): Badge[] {
  return [
    { id: "first-play", label: "First Spin", description: "Tracked your first play", earned: i.totalPlays >= 1 },
    { id: "century", label: "Century", description: "100 plays tracked", earned: i.totalPlays >= 100 },
    { id: "explorer", label: "Explorer", description: "50 different songs", earned: i.uniqueTracks >= 50 },
    { id: "dedicated", label: "Dedicated", description: "7-day listening streak", earned: i.currentStreak >= 7 },
    { id: "night-owl", label: "Night Owl", description: "Listened between midnight & 5am", earned: i.hasNightPlay },
    { id: "superfan", label: "Superfan", description: "Favorited 5+ artists", earned: i.favoriteArtistCount >= 5 },
  ];
}
