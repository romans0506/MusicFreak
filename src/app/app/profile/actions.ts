"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { isSpotifyId } from "@/lib/spotify"

type TrackInput = {
  id: string
  name: string
  artists: string
  albumArt: string | null
  artistIds?: string[]
}

export async function toggleFavoriteSong(track: TrackInput, isFavorited: boolean) {
  // favorite_songs is public-read and album_art is rendered in <img> for
  // other users — validate ids and allow only https image URLs.
  if (!isSpotifyId(track.id)) return { error: "invalid_track" }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "not_authenticated" }

  if (isFavorited) {
    const { error } = await supabase
      .from("favorite_songs")
      .delete()
      .eq("user_id", user.id)
      .eq("track_id", track.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from("favorite_songs").insert({
      user_id: user.id,
      track_id: track.id,
      name: track.name.slice(0, 300),
      artists: track.artists.slice(0, 300),
      album_art: track.albumArt?.startsWith("https://") ? track.albumArt.slice(0, 600) : null,
      artist_ids: (track.artistIds ?? []).filter(isSpotifyId).slice(0, 20),
    })
    if (error) return { error: error.message }
  }

  revalidatePath("/profile")
  return { success: true }
}
