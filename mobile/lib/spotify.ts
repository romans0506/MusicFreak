import { getSpotifyToken, noteSpotify429, spotifyCooldown } from "@/lib/spotify-auth";
import { supabase } from "@/lib/supabase";

// Personal Spotify data (/v1/me/...) only — the reliable surface for a user
// token. Catalog endpoints (/v1/search, /v1/artists) need an app token (client
// secret) and 403 here, so we never call them from the device.
//
// Tokens come from lib/spotify-auth.ts, which holds our own PKCE refresh token
// and mints a fresh access token whenever this asks for one. That is what keeps
// a session alive indefinitely; this file used to read
// `session.provider_token`, which Supabase drops on its own session refresh, so
// everything here went dead roughly an hour after login.
//
// Calls still degrade to null/[] rather than throwing: the user can be offline,
// cooling down from a 429, or not connected yet.

async function userToken(): Promise<string | null> {
  const token = await getSpotifyToken();
  if (token) return token;

  // A cool-down means "stop talking to Spotify". Without this, the fallback
  // below would route around it: getSpotifyToken() returns null while
  // rate-limited, and callers would silently switch to the stale provider_token.
  if (spotifyCooldown() > 0) return null;

  // Fallback for the gap between signing in and the PKCE connection being
  // made — and for anyone still carrying a session from before it existed.
  // Valid for about an hour after login and never renewed, hence the PKCE flow.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.provider_token ?? null;
}

/**
 * `ok` distinguishes "request failed" from "answered with an empty result" —
 * a new account legitimately has no top artists, and that isn't an error.
 * `status` says why it failed; each cause needs different UI copy.
 */
export type FailStatus =
  /** No token at all: never connected, disconnected, or in a 429 cool-down. */
  | 0
  /** Network error / offline — the request never completed. */
  | -1
  /** Any HTTP status Spotify returned (401, 403, 429, 5xx…). */
  | number;

type MeResult<T> = { ok: boolean; data: T | null; status: FailStatus };

async function meResult<T>(path: string): Promise<MeResult<T>> {
  // Check the cool-down first: no request, no token work, no log noise.
  if (spotifyCooldown() > 0) return { ok: false, data: null, status: 429 };

  const token = await userToken();
  if (!token) {
    console.warn(`[spotify] ${path} — no token available (not connected, or cooling down from a 429)`);
    return { ok: false, data: null, status: 0 };
  }
  try {
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 204) return { ok: true, data: null, status: 204 };
    if (!res.ok) {
      // A 429 here shares the client_id with OAuth login, so it has to stop
      // the whole app talking to Spotify, not just this request.
      if (res.status === 429) noteSpotify429(res.headers.get("retry-after"));
      // Spotify puts a readable reason in the body — worth having in the log.
      const detail = await res.text().catch(() => "");
      console.warn(`[spotify] ${path} → HTTP ${res.status} ${detail.slice(0, 200)}`);
      return { ok: false, data: null, status: res.status };
    }
    return { ok: true, data: (await res.json()) as T, status: res.status };
  } catch (err) {
    console.warn(`[spotify] ${path} — request threw`, err);
    return { ok: false, data: null, status: -1 };
  }
}

async function me<T>(path: string): Promise<T | null> {
  return (await meResult<T>(path)).data;
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
  return (await getTopArtists(limit)).artists;
}

/**
 * The same list plus whether Spotify answered, for the Artists tab's error
 * state. Empty is NOT a failure: `medium_term` covers roughly six months, so a
 * fresh Spotify account has nothing there yet — hence the `short_term` retry
 * before we report an empty list.
 */
export async function getTopArtists(
  limit = 24,
): Promise<{ ok: boolean; artists: ArtistFull[]; status: FailStatus }> {
  const medium = await meResult<any>(`/me/top/artists?limit=${limit}&time_range=medium_term`);
  if (!medium.ok) return { ok: false, artists: [], status: medium.status };

  let items: any[] = medium.data?.items ?? [];
  if (items.length === 0) {
    const short = await meResult<any>(`/me/top/artists?limit=${limit}&time_range=short_term`);
    if (!short.ok) return { ok: false, artists: [], status: short.status };
    items = short.data?.items ?? [];
  }
  return { ok: true, artists: items.map(toArtistFull), status: 200 };
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
 * the same thing), so the device can call it. Returns null if we can't get a
 * token at all (offline, or Spotify disconnected).
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

/** A song the Lyric → Song game can look lyrics up for. */
export type LyricSong = { id: string; name: string; artist: string };

/**
 * The user's top tracks as bare title+artist pairs — the pool for Lyric → Song's
 * "Your Top 50" mode. Same request the web generator makes (limit 50,
 * medium_term); we hand lrclib the title and artist, nothing else.
 *
 * Returns [] if there's no usable token, which the game surfaces as "pick an
 * artist instead" rather than an error.
 */
export async function getTopTrackSongs(): Promise<LyricSong[]> {
  const d = await me<any>("/me/top/tracks?limit=50&time_range=medium_term");
  return (d?.items ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    artist: t.artists?.[0]?.name ?? "",
  }));
}

/** A track we know enough about to store as a favourite. */
export type CatalogTrack = {
  id: string;
  name: string;
  artists: string;
  albumArt: string | null;
  /** Spotify artist ids — favorite_songs.artist_ids powers artist-page counts. */
  artistIds: string[];
};

/**
 * The pool of songs you can favourite from the device.
 *
 * The web app favourites straight out of Spotify's catalogue search, which the
 * device cannot reach: /v1/search needs the app token. So instead of a catalogue
 * we offer everything Spotify will tell us about *your* listening — recently
 * played plus your top tracks across all three ranges. Those are /v1/me/...
 * endpoints, they answer a user token, and crucially they return full track
 * objects, so each favourite carries real Spotify track and artist ids and stays
 * compatible with the web app and the artist pages' "Loved by" counts.
 *
 * The trade-off is honest and worth stating in the UI: you can favourite
 * anything you have listened to, not anything that exists.
 */
export async function getFavoritableTracks(): Promise<CatalogTrack[]> {
  const [recent, shortTerm, mediumTerm, longTerm] = await Promise.all([
    me<any>("/me/player/recently-played?limit=50"),
    me<any>("/me/top/tracks?limit=50&time_range=short_term"),
    me<any>("/me/top/tracks?limit=50&time_range=medium_term"),
    me<any>("/me/top/tracks?limit=50&time_range=long_term"),
  ]);

  const seen = new Set<string>();
  const out: CatalogTrack[] = [];

  function add(t: any) {
    if (!t?.id || seen.has(t.id)) return;
    seen.add(t.id);
    out.push({
      id: t.id,
      name: t.name,
      artists: (t.artists ?? []).map((a: any) => a.name).join(", "),
      albumArt: t.album?.images?.[0]?.url ?? null,
      artistIds: (t.artists ?? []).map((a: any) => a.id).filter(Boolean),
    });
  }

  // Recently played first — the most likely thing you came here to favourite.
  for (const item of recent?.items ?? []) add(item.track);
  for (const data of [shortTerm, mediumTerm, longTerm]) {
    for (const track of data?.items ?? []) add(track);
  }
  return out;
}
