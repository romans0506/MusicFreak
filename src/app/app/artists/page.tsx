import { createClient } from "@/lib/supabase/server"
import ArtistsView from "@/components/artists-view"

type SpotifyArtist = {
  id: string
  name: string
  genres: string[]
  popularity: number
  images: { url: string; width: number; height: number }[]
  external_urls: { spotify: string }
}

export default async function ArtistsPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  let artists: SpotifyArtist[] = []
  let error: string | null = null

  if (session?.provider_token) {
    // Per-user data — must NOT land in the shared Data Cache, so no-store.
    // (Only hit on tab navigation, so the rate-limit cost is negligible.)
    const res = await fetch(
      "https://api.spotify.com/v1/me/top/artists?limit=24&time_range=medium_term",
      {
        headers: { Authorization: `Bearer ${session.provider_token}` },
        cache: "no-store",
      }
    )
    if (res.ok) {
      const data = await res.json()
      artists = data.items ?? []
    } else {
      error = "Could not load your Spotify artists. Try signing out and back in."
    }
  } else {
    error = "No Spotify session found. Try signing out and back in."
  }

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Your Artists</h1>
        <p className="mt-2 text-muted-foreground">Your top artists on Spotify this month.</p>
      </div>
      <ArtistsView artists={artists} error={error} />
    </div>
  )
}
