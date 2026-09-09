import { useEffect, useSyncExternalStore } from "react";

import type { CatalogTrack } from "@/lib/spotify";
import { supabase } from "@/lib/supabase";

/**
 * The signed-in user's favourite songs, shared across the app.
 *
 * A store rather than per-screen state because several places need the same
 * answer at once — the profile list, the picker sheet, and the heart on Now
 * Playing all have to agree the instant one of them toggles. Fetching in each
 * would leave a heart filled on one screen and hollow on another.
 *
 * Writes are optimistic and roll back on failure: `favorite_songs` is owner-write
 * under RLS, so the only realistic failure is being offline, and a heart that
 * refuses to fill until a round trip completes feels broken.
 */

export type FavoriteSong = {
  id: string;
  track_id: string;
  name: string;
  artists: string;
  album_art: string | null;
};

/** Spotify ids are 22 base-62 characters. Mirrors isSpotifyId() on the web. */
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;

/** null = not loaded yet. */
let favorites: FavoriteSong[] | null = null;
let loadedFor: string | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function currentUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Fetch once per user. `force` re-reads after an external change. */
export async function loadFavorites({ force = false } = {}): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  if (!force && loadedFor === userId && favorites !== null) return;
  if (inflight) return inflight;

  inflight = (async () => {
    const { data } = await supabase
      .from("favorite_songs")
      .select("id, track_id, name, artists, album_art")
      .eq("user_id", userId)
      .order("added_at", { ascending: false });
    favorites = (data ?? []) as FavoriteSong[];
    loadedFor = userId;
    emit();
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/** Drop everything on sign-out so the next user doesn't inherit these. */
export function clearFavorites() {
  favorites = null;
  loadedFor = null;
  emit();
}

/** The list, or null while it's still loading. Triggers the initial load. */
export function useFavoriteSongs(): FavoriteSong[] | null {
  useEffect(() => {
    void loadFavorites();
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => favorites,
    () => favorites,
  );
}

/** Whether one track is favourited. Safe to call before the list has loaded. */
export function useIsFavorite(trackId: string | undefined): boolean {
  const list = useFavoriteSongs();
  if (!trackId || !list) return false;
  return list.some((f) => f.track_id === trackId);
}

/**
 * Add or remove a favourite. Mirrors the web server action
 * (src/app/app/profile/actions.ts) field for field — `favorite_songs` is
 * public-read and `album_art` is rendered for other users, so ids are validated
 * and only https artwork is stored.
 */
export async function toggleFavoriteSong(track: CatalogTrack): Promise<void> {
  if (!SPOTIFY_ID.test(track.id)) return;
  const userId = await currentUserId();
  if (!userId) return;

  const before = favorites ?? [];
  const existing = before.find((f) => f.track_id === track.id);

  if (existing) {
    favorites = before.filter((f) => f.track_id !== track.id);
    emit();
    const { error } = await supabase.from("favorite_songs").delete().eq("id", existing.id);
    if (error) {
      favorites = before;
      emit();
    }
    return;
  }

  const row = {
    user_id: userId,
    track_id: track.id,
    name: track.name.slice(0, 300),
    artists: track.artists.slice(0, 300),
    album_art: track.albumArt?.startsWith("https://") ? track.albumArt.slice(0, 600) : null,
    artist_ids: track.artistIds.filter((id) => SPOTIFY_ID.test(id)).slice(0, 20),
  };

  // Optimistic row with a placeholder id, swapped for the real one on success —
  // the id is what a later delete keys on, so it can't stay fake.
  favorites = [{ id: `pending-${track.id}`, ...row } as FavoriteSong, ...before];
  emit();

  const { data, error } = await supabase.from("favorite_songs").insert(row).select("id").single();
  if (error || !data) {
    favorites = before;
    emit();
    return;
  }
  favorites = (favorites ?? []).map((f) =>
    f.track_id === track.id ? { ...f, id: data.id as string } : f,
  );
  emit();
}
