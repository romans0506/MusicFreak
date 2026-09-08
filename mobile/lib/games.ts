import {
  findItunesArtistId,
  normalize,
  shuffle,
  songsForArtist,
  type ItunesSong,
} from "@/lib/itunes";
import { MUSIC_TRIVIA } from "@/lib/music-trivia";
import { getTopTrackSongs, type LyricSong } from "@/lib/spotify";
import { supabase } from "@/lib/supabase";

/**
 * Device-side twins of the web app's game generators.
 *
 * On web each game is built by a route handler (src/app/api/games/*, plus
 * /api/quiz/generate) because it needs the Spotify app token and a server-side
 * rate limiter. The device has neither an API layer nor an app token, so these
 * run right here — which is only possible because the web generators lean on
 * keyless sources for the parts that matter:
 *
 *   Music Quiz      static bank (lib/music-trivia.ts)     no network at all
 *   Lyric → Song    lrclib.net + iTunes                   keyless
 *   Name That Song  iTunes (song list AND 30s preview)    keyless
 *
 * So all three keep working even with Spotify unreachable or disconnected —
 * the one exception being Lyric → Song's "Your Top 50" mode, whose song pool is
 * /me/top/tracks. That mode degrades to "no songs", and the game points the
 * player at "By Artist" instead.
 *
 * The server-side rate limiters have no counterpart here: that limiter exists
 * to stop one IP hammering our routes, and there are no routes. lrclib's burst
 * throttle is still real though, hence LRCLIB_CONCURRENCY below.
 */

export type Question = {
  id: string;
  question: string;
  /** Optional secondary line under the question (e.g. an artist hint). */
  hint?: string | null;
  image: string | null;
  options: string[];
  correctIndex: number;
};

export type NameSongOption = { name: string; albumArt: string | null };

export type NameSongRound = {
  id: string;
  previewUrl: string;
  options: NameSongOption[];
  correctIndex: number;
};

/** An artist chosen in the picker. `spotifyId` is null for iTunes-only results. */
export type GameArtist = {
  name: string;
  image: string | null;
  /** Set only when the artist came from the user's Spotify top artists. */
  spotifyId: string | null;
};

const TARGET_QUESTIONS = 10;

// ── Music Quiz ──────────────────────────────────────────────────────────────

/**
 * Ten random trivia questions, options shuffled. Synchronous — the bank ships
 * with the app, so this is the one game here that works with no network at all.
 */
export function buildQuizQuestions(): Question[] {
  return shuffle(MUSIC_TRIVIA)
    .slice(0, TARGET_QUESTIONS)
    .map((q) => {
      // options[0] is the authored correct answer; shuffle so its position varies.
      const correct = q.options[0];
      const options = shuffle(q.options);
      return {
        id: q.id,
        question: q.question,
        image: null, // no artist photos on device — see lib/music-trivia.ts
        options,
        correctIndex: options.indexOf(correct),
      };
    });
}

// ── Lyric → Song ────────────────────────────────────────────────────────────

// lrclib rate-limits bursts hard: the web app measured ~20 parallel requests
// being 429'd down to ~6 successes, and ~5 all returning 200. Keep the same
// ceiling — a phone's IP has more headroom than our shared server IP, but the
// gain from racing more requests is small and the failure mode is a short round.
const LRCLIB_CONCURRENCY = 5;

async function fetchLyrics(name: string, artist: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ track_name: name, artist_name: artist });
    const res = await fetch("https://lrclib.net/api/search?" + params, {
      headers: { "User-Agent": "MusicFreak Mobile (https://musicfreak.app)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    const hit = data.find(
      (d: any) => !d.instrumental && typeof d.plainLyrics === "string" && d.plainLyrics.length > 40,
    );
    return hit?.plainLyrics ?? null;
  } catch {
    return null;
  }
}

/**
 * Pull a short, fair lyric snippet: a window of 2 consecutive lines from
 * roughly the middle, skipping lines that contain the song title or artist
 * (which would give the answer away).
 */
function pickSnippet(plain: string, title: string, artist: string): string | null {
  const lines = plain
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => l.length >= 8 && l.length <= 60);

  const titleLc = title.toLowerCase();
  const artistLc = artist.toLowerCase();
  const safe = lines.filter(
    (l) => !l.toLowerCase().includes(titleLc) && !l.toLowerCase().includes(artistLc),
  );
  if (safe.length < 2) return null;

  // Prefer a window from the middle third of the song.
  const start = Math.max(0, Math.floor(safe.length / 3));
  const candidates = safe.slice(start);
  const idx = Math.floor(Math.random() * Math.max(1, candidates.length - 1));
  return [candidates[idx], candidates[idx + 1]].filter(Boolean).join("\n");
}

/**
 * Resolve lyrics for a sample of songs and turn the ones that work into
 * questions. `allNames` is the full pool the wrong answers are drawn from
 * (whole top-50 / whole artist catalogue), so distractors aren't limited to the
 * sampled songs.
 */
async function buildLyricRound(
  sample: LyricSong[],
  allNames: string[],
  hint: string,
): Promise<Question[]> {
  const questions: Question[] = [];
  let next = 0;

  async function worker() {
    while (next < sample.length && questions.length < TARGET_QUESTIONS) {
      const song = sample[next++];
      const plain = await fetchLyrics(song.name, song.artist);
      if (!plain || questions.length >= TARGET_QUESTIONS) continue;

      const snippet = pickSnippet(plain, song.name, song.artist);
      if (!snippet) continue;

      const wrong = shuffle(allNames.filter((n) => n !== song.name)).slice(0, 3);
      if (wrong.length < 3) continue;

      const options = shuffle([song.name, ...wrong]);
      questions.push({
        id: "lyric-" + song.id,
        question: snippet,
        hint,
        image: null, // text-only — artwork would hint the answer
        options,
        correctIndex: options.indexOf(song.name),
      });
    }
  }

  await Promise.all(Array.from({ length: LRCLIB_CONCURRENCY }, worker));
  return questions.slice(0, TARGET_QUESTIONS);
}

/** Lyric → Song, "Your Top 50" mode. Empty if Spotify is unreachable. */
export async function buildLyricQuestionsFromTopTracks(): Promise<Question[]> {
  const tracks = await getTopTrackSongs();
  if (tracks.length < 4) return [];

  const allNames = tracks.map((t) => t.name);
  // Many tracks (non-English/niche) have no lrclib entry, so sample wide to
  // reliably reach the 10-question cap.
  const sample = shuffle(tracks).slice(0, 35);
  return buildLyricRound(sample, allNames, "Which song is this lyric from?");
}

/** Lyric → Song, "By Artist" mode: iTunes catalogue → lrclib lyrics. Keyless. */
export async function buildLyricQuestionsForArtist(artistName: string): Promise<Question[]> {
  const artistId = await findItunesArtistId(artistName);
  if (!artistId) return [];

  const songs = await songsForArtist(artistId, artistName);
  if (songs.length < 4) return [];

  const allNames = songs.map((s) => s.name);
  const sample: LyricSong[] = shuffle(songs)
    .slice(0, 40)
    .map((s) => ({ id: s.id, name: s.name, artist: artistName }));

  return buildLyricRound(sample, allNames, "Which " + artistName + " song is this?");
}

// ── Name That Song ──────────────────────────────────────────────────────────

type PlayableSong = ItunesSong & { previewUrl: string };

/**
 * Up to 10 rounds of "guess the song from a 5s clip". Both the song list and
 * the audio come from iTunes, so the clip always matches its label and we get
 * the artist's whole catalogue rather than only tracks the user has played
 * (Spotify's own preview_url is null on most tracks anyway).
 */
export async function buildNameSongRounds(artistName: string): Promise<NameSongRound[]> {
  const artistId = await findItunesArtistId(artistName);
  if (!artistId) return [];

  // This game needs audio, so keep only tracks with a usable preview.
  const candidates = (await songsForArtist(artistId, artistName)).filter(
    (s): s is PlayableSong => !!s.previewUrl,
  );
  if (candidates.length < 4) return [];

  const rounds: NameSongRound[] = [];
  for (const track of shuffle(candidates)) {
    const wrong = shuffle(
      candidates.filter((c) => normalize(c.name) !== normalize(track.name)),
    ).slice(0, 3);
    if (wrong.length < 3) continue;

    const picked = shuffle([track, ...wrong]);
    rounds.push({
      id: "ns-" + track.id,
      previewUrl: track.previewUrl,
      options: picked.map((c) => ({ name: c.name, albumArt: c.albumArt })),
      correctIndex: picked.indexOf(track),
    });
    if (rounds.length >= TARGET_QUESTIONS) break;
  }

  return rounds;
}

// ── Scores ──────────────────────────────────────────────────────────────────

/** Must match the scores.game_type CHECK constraint in Supabase. */
export type GameType = "guess-second" | "music-quiz" | "lyric-song";

/**
 * Persist a finished run. The web app posts to /api/scores; here we insert
 * straight into the table, which RLS scopes to the signed-in user — the same
 * path the web route takes, since it uses the user's session too, not the
 * service role.
 *
 * `artist` is attached only by Name That Song, and only when the artist carries
 * a Spotify id: that's what get_name_song_leaderboard groups on, so an
 * iTunes-only artist would silently split the ranking. Those runs still count
 * towards the player's total points, they just don't join a per-artist board.
 */
export async function saveScore(
  gameType: GameType,
  points: number,
  artist?: GameArtist | null,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const row: Record<string, unknown> = { user_id: user.id, game_type: gameType, points };
  if (artist?.spotifyId) {
    row.artist_id = artist.spotifyId;
    row.artist_name = artist.name.slice(0, 200);
    row.artist_image = artist.image?.startsWith("https://") ? artist.image.slice(0, 600) : null;
  }

  const { error } = await supabase.from("scores").insert(row);
  if (error) console.warn("[scores]", error.message);
}
