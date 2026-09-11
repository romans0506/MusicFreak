import { supabase } from "@/lib/supabase";
import type { ArtistFull } from "@/lib/spotify";

// Spotify catalog search via the `spotify-search` Supabase Edge Function
// (supabase/functions/spotify-search/index.ts). /v1/search needs the app
// token, which needs the client secret, which can't ship in the bundle.
// Results carry real Spotify ids, so everything keyed on artist id
// (artist screen, favourites, leaderboard, live dates) works for them.

export type SearchResult = {
  /** false when the call itself failed — no deployment, offline, or a 429. */
  ok: boolean;
  artists: ArtistFull[];
};

const cache = new Map<string, { artists: ArtistFull[]; expiresAt: number }>();
const TTL_MS = 10 * 60_000;

export async function searchArtists(query: string): Promise<SearchResult> {
  const q = query.trim();
  if (q.length < 2) return { ok: true, artists: [] };

  const key = q.toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { ok: true, artists: cached.artists };

  try {
    const { data, error } = await supabase.functions.invoke("spotify-search", { body: { q } });
    if (error || data?.ok === false) return { ok: false, artists: cached?.artists ?? [] };

    // Search results are id/name/image only (dev-mode apps get no followers or
    // popularity from /v1/search); the artist screen fills the rest in.
    const artists: ArtistFull[] = (data?.artists ?? []).map(
      (a: { id: string; name: string; image: string | null }) => ({
        id: a.id,
        name: a.name,
        image: a.image ?? undefined,
        genres: [],
        popularity: 0,
        followers: 0,
      }),
    );

    cache.set(key, { artists, expiresAt: Date.now() + TTL_MS });
    return { ok: true, artists };
  } catch {
    return { ok: false, artists: cached?.artists ?? [] };
  }
}
