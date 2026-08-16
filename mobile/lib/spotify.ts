import { supabase } from "@/lib/supabase";

// Personal Spotify data (/v1/me/...) only — the reliable surface for a user
// token. Catalog endpoints (/v1/search, /v1/artists) need an app token (client
// secret) and 403 here, so we never call them from the device.
//
// We use the session's provider_token directly. It's fresh right after login
// (~1h) and dropped on Supabase session refresh — minting a new one needs the
// client secret, which must stay server-side. So every call degrades gracefully
// to empty/null; full coverage returns once the web backend proxy is deployed.

async function userToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.provider_token ?? null;
}

async function me<T>(path: string): Promise<T | null> {
  const token = await userToken();
  if (!token) return null;
  try {
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 204 || !res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type NowPlaying = {
  playing: boolean;
  track?: {
    id: string;
    name: string;
    artists: string;
    album: string;
    albumArt?: string;
  };
};

export type RecentTrack = {
  playedAt: string;
  id: string;
  name: string;
  artists: string;
  albumArt?: string;
};

export type TopArtist = { id: string; name: string; image?: string; genre?: string };

/** A fuller artist shape than TopArtist — /me/top/artists already returns all of this. */
export type ArtistFull = {
  id: string;
  name: string;
  image?: string;
  genres: string[];
  popularity: number;
  followers: number;
};

export type GenreSlice = { genre: string; count: number };

export type TopTrack = {
  id: string;
  name: string;
  artists: string;
  albumArt?: string;
  popularity: number;
};
export type TopAlbum = { id: string; name: string; artist: string; image?: string; count: number };
export type TopStats = { topArtists: TopArtist[]; topTracks: TopTrack[]; topAlbums: TopAlbum[] };

export async function getNowPlaying(): Promise<NowPlaying> {
  const d = await me<any>("/me/player/currently-playing");
  if (!d || !d.item) return { playing: false };
  const t = d.item;
  return {
    playing: !!d.is_playing,
    track: {
      id: t.id,
      name: t.name,
      artists: (t.artists ?? []).map((a: any) => a.name).join(", "),
      album: t.album?.name ?? "",
      albumArt: t.album?.images?.[0]?.url,
    },
  };
}

export async function getRecentlyPlayed(limit = 20): Promise<RecentTrack[]> {
  const d = await me<any>(`/me/player/recently-played?limit=${limit}`);
  return (d?.items ?? []).map((it: any) => ({
    playedAt: it.played_at,
    id: it.track?.id,
    name: it.track?.name,
    artists: (it.track?.artists ?? []).map((a: any) => a.name).join(", "),
    albumArt: it.track?.album?.images?.[0]?.url,
  }));
}

/**
 * Raw `recently-played` items for the scrobbler — `RecentTrack` throws away the
 * album/duration fields `play_history` needs. `after` is a Unix ms timestamp.
 */
export async function getRecentlyPlayedRaw(afterMs?: number | null): Promise<any[]> {
  const cursor = afterMs ? `&after=${afterMs}` : "";
  const d = await me<any>(`/me/player/recently-played?limit=50${cursor}`);
  return d?.items ?? [];
}

export async function getTopStats(): Promise<TopStats> {
  const [artistsData, tracksData] = await Promise.all([
    me<any>("/me/top/artists?limit=5&time_range=short_term"),
    me<any>("/me/top/tracks?limit=50&time_range=short_term"),
  ]);

  const topArtists: TopArtist[] = (artistsData?.items ?? []).slice(0, 5).map((a: any) => ({
    id: a.id,
    name: a.name,
    image: a.images?.[0]?.url,
    genre: a.genres?.[0],
  }));

  const topTracks: TopTrack[] = (tracksData?.items ?? []).slice(0, 5).map((t: any) => ({
    id: t.id,
    name: t.name,
    artists: (t.artists ?? []).map((a: any) => a.name).join(", "),
    albumArt: t.album?.images?.[0]?.url,
    popularity: t.popularity ?? 0,
  }));

  // Derive top albums from the top-50 tracks (same as the web route).
  const albumMap: Record<string, TopAlbum> = {};
  for (const t of tracksData?.items ?? []) {
    const id = t.album?.id;
    if (!id) continue;
    albumMap[id] ??= {
      id,
      name: t.album.name,
      artist: t.artists?.[0]?.name ?? "",
      image: t.album.images?.[0]?.url,
      count: 0,
    };
    albumMap[id].count++;
  }
  const topAlbums = Object.values(albumMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return { topArtists, topTracks, topAlbums };
}

function toArtistFull(a: any): ArtistFull {
  return {
    id: a.id,
    name: a.name,
    image: a.images?.[0]?.url,
    genres: a.genres ?? [],
    popularity: a.popularity ?? 0,
    followers: a.followers?.total ?? 0,
  };
}

/**
 * The user's top artists — the Artists tab's list. Mirrors the web
 * /app/artists page (limit 24, medium_term). /me/top/artists returns complete
 * artist objects, so genres/popularity/followers come along for free (unlike
 * /v1/search, which omits followers for development-mode apps).
 */
export async function getTopArtistsFull(limit = 24): Promise<ArtistFull[]> {
  const d = await me<any>(`/me/top/artists?limit=${limit}&time_range=medium_term`);
  return (d?.items ?? []).map(toArtistFull);
}

/**
 * Top genres, tallied across the user's top 50 artists — Spotify is the only
 * genre source there is (play_history stores no genre). Same shape and cut-off
 * (6) as the web stats page.
 */
export async function getTopGenres(): Promise<GenreSlice[]> {
  const d = await me<any>("/me/top/artists?limit=50&time_range=medium_term");
  if (!d) return [];

  const tally: Record<string, number> = {};
  for (const artist of d.items ?? []) {
    for (const g of artist.genres ?? []) tally[g] = (tally[g] ?? 0) + 1;
  }
  return Object.entries(tally)
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

/**
 * A single artist. This is a catalog endpoint, but unlike batch /v1/artists?ids=
 * and /v1/search it does answer a *user* token (the web artist page relies on
 * the same thing), so the device can call it. Returns null when the token has
 * aged out.
 */
export async function getArtist(artistId: string): Promise<ArtistFull | null> {
  const d = await me<any>(`/artists/${artistId}`);
  return d ? toArtistFull(d) : null;
}

/**
 * An artist's "top tracks" for this user. GET /v1/artists/{id}/top-tracks is
 * deprecated (403), so — exactly like the web artist-tracks route — we pull the
 * user's own top tracks across all three time ranges and filter by artist.
 */
export async function getArtistTopTracks(artistId: string): Promise<TopTrack[]> {
  const ranges = ["short_term", "medium_term", "long_term"];
  const results = await Promise.all(
    ranges.map((r) => me<any>(`/me/top/tracks?limit=50&time_range=${r}`)),
  );

  const seen = new Set<string>();
  const matched: any[] = [];
  for (const d of results) {
    for (const track of d?.items ?? []) {
      if (seen.has(track.id)) continue;
      if (!(track.artists ?? []).some((a: any) => a.id === artistId)) continue;
      seen.add(track.id);
      matched.push(track);
    }
  }

  return matched
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, 10)
    .map((t) => ({
      id: t.id,
      name: t.name,
      artists: (t.artists ?? []).map((a: any) => a.name).join(", "),
      albumArt: t.album?.images?.[0]?.url,
      popularity: t.popularity ?? 0,
    }));
}
