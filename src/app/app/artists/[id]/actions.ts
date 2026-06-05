"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function toggleFavoriteArtist(
  artistId: string,
  artistName: string,
  artistImage: string,
  isFavorited: boolean
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  if (isFavorited) {
    await supabase
      .from("favorite_artists")
      .delete()
      .eq("user_id", user.id)
      .eq("artist_id", artistId)
  } else {
    await supabase.from("favorite_artists").insert({
      user_id: user.id,
      artist_id: artistId,
      artist_name: artistName,
      artist_image: artistImage,
    })
  }

  revalidatePath(`/app/artists/${artistId}`)
  return { success: true }
}
