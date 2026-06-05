"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

type TrackInput = {
  id: string
  name: string
  artists: string
  albumArt: string | null
  artistIds?: string[]
}

export async function toggleFavoriteSong(track: TrackInput, isFavorited: boolean) {
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
      name: track.name,
      artists: track.artists,
      album_art: track.albumArt,
      artist_ids: track.artistIds ?? [],
    })
    if (error) return { error: error.message }
  }

  revalidatePath("/profile")
  return { success: true }
}
