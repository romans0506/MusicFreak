"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { isSpotifyId } from "@/lib/spotify"

export async function toggleFavoriteArtist(
  artistId: string,
  artistName: string,
  artistImage: string,
  isFavorited: boolean
) {
  // favorite_artists is public-read and the image is rendered in <img> for
  // other users — validate the id and allow only https image URLs.
  if (!isSpotifyId(artistId)) return { error: "Invalid artist" }

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
      artist_name: artistName.slice(0, 200),
      artist_image: artistImage.startsWith("https://") ? artistImage.slice(0, 600) : null,
    })
  }

  revalidatePath(`/app/artists/${artistId}`)
  return { success: true }
}
