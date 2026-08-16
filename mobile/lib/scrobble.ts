import { getRecentlyPlayedRaw } from "@/lib/spotify";
import { supabase } from "@/lib/supabase";

/**
 * The device-side scrobbler — the mobile counterpart of the web app's
 * `<PlayScrobbler/>` + `/api/spotify/ingest-plays`.
 *
 * Spotify publishes no play counts, so every listening number in this app
 * (minutes, top artists/albums, streaks) is summed from rows *we* wrote into
 * `play_history`. Before this existed the phone only ever read that table, so
 * listening time only moved while a browser tab was open somewhere — which is
 * why it looked stuck at zero for phone-only users.
 *
 * Same contract as the web route on purpose: `after=<last stored play>` as the
 * cursor, and `(user_id, played_at)` as the dedup key, so both platforms can
 * write into the same table without double-counting. Keep the row shape in sync
 * with `src/app/api/spotify/ingest-plays/route.ts`.
 *
 * Caveat inherited from `lib/spotify.ts`: this runs on the device's
 * `provider_token`, so it goes quiet ~1h after login until the user signs in
 * again. Plays are not lost — `recently-played` still returns the last 50
 * whenever we next get a working token.
 */

/** Spotify's own list only changes when a track finishes; polling faster is waste. */
const THROTTLE_MS = 90_000;

let lastRun = 0;
let inFlight: Promise<number> | null = null;

/** Returns how many plays were written. Safe to call often — it self-throttles. */
export function ingestRecentPlays({ force = false } = {}): Promise<number> {
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastRun < THROTTLE_MS) return Promise.resolve(0);

  inFlight = run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(): Promise<number> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return 0;

  // Mark the attempt before the network call, so a failing token doesn't turn
  // into a poll loop.
  lastRun = Date.now();

  const { data: latest } = await supabase
    .from("play_history")
    .select("played_at")
    .eq("user_id", userId)
    .order("played_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const items = await getRecentlyPlayedRaw(
    latest?.played_at ? Date.parse(latest.played_at) : null,
  );
  if (items.length === 0) return 0;

  const rows = items
    .filter((entry) => entry.track?.id && entry.played_at)
    .map((entry) => ({
      user_id: userId,
      track_id: entry.track.id,
      name: entry.track.name,
      artists: entry.track.artists?.map((a: { name: string }) => a.name).join(", ") ?? "",
      artist_id: entry.track.artists?.[0]?.id ?? null,
      album_art: entry.track.album?.images?.[1]?.url ?? entry.track.album?.images?.[0]?.url ?? null,
      album_id: entry.track.album?.id ?? null,
      album_name: entry.track.album?.name ?? null,
      // The whole point: minutes-listened sums this column.
      duration_ms: entry.track.duration_ms ?? null,
      played_at: entry.played_at,
    }));

  const { error } = await supabase
    .from("play_history")
    .upsert(rows, { onConflict: "user_id,played_at", ignoreDuplicates: true });

  return error ? 0 : rows.length;
}
