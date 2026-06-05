import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import ArtistDetail from "@/components/artist-detail"
import { toggleFavoriteArtist } from "./actions"

type SpotifyArtist = {
  id: string
  name: string
  genres: string[]
  popularity: number
  followers: { total: number }
  images: { url: string }[]
}

type Fan = {
  user_id: string
  profiles: { username: string | null; avatar_url: string | null; custom_avatar_url: string | null } | null
}

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: { user } }, { data: { session } }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ])

  if (!session?.provider_token) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="font-medium">Session expired</p>
        <p className="text-sm text-muted-foreground">Please sign out and sign in again.</p>
      </div>
    )
  }

  const [artistRes, { data: fans }, { data: lovedSongsRaw }] = await Promise.all([
    fetch(`https://api.spotify.com/v1/artists/${id}`, {
      headers: { Authorization: `Bearer ${session.provider_token}` },
      next: { revalidate: 3600 },
    }),
    supabase
      .from("favorite_artists")
      .select("user_id, profiles(username, avatar_url, custom_avatar_url)")
      .eq("artist_id", id)
      .limit(30),
    supabase
      .from("favorite_songs")
      .select("track_id, name, artists, album_art")
      .contains("artist_ids", [id]),
  ])

  if (!artistRes.ok) notFound()

  const artist: SpotifyArtist = await artistRes.json()
  const isFavorited = fans?.some((f) => f.user_id === user?.id) ?? false

  // Count loves per track
  const loveMap: Record<string, { track_id: string; name: string; artists: string; album_art: string | null; count: number }> = {}
  for (const row of lovedSongsRaw ?? []) {
    if (!loveMap[row.track_id]) {
      loveMap[row.track_id] = { track_id: row.track_id, name: row.name, artists: row.artists, album_art: row.album_art, count: 0 }
    }
    loveMap[row.track_id].count++
  }
  const lovedSongs = Object.values(loveMap).sort((a, b) => b.count - a.count).slice(0, 10)

  return (
    <ArtistDetail
      artist={artist}
      artistId={id}
      fans={(fans as unknown as Fan[]) ?? []}
      isFavorited={isFavorited}
      toggleFavorite={toggleFavoriteArtist}
      lovedSongs={lovedSongs}
    />
  )
}
