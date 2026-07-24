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
export type TopTrack = {
  id: string;
  name: string;
  artists: string;
  albumArt?: string;
  popularity: number;
};
export type TopAlbum = { id: string; name: string; artist: string; image?: string; count: number };
export type TopStats = { topArtists: TopArtist[]; topTracks: TopTrack[]; topAlbums: TopAlbum[] };

/* eslint-disable @typescript-eslint/no-explicit-any */

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
