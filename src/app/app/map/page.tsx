import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { resolveSpotifyUserToken, spotifyUserFetch } from "@/lib/spotify"
import WorldMap from "@/components/world-map"

export default async function MapPage() {
  const supabase = await createClient()
  const [{ data: { user } }, { data: { session } }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ])
  if (!user) redirect("/")

  // Existing stored country (manual or previously detected).
  const { data: profile } = await supabase
    .from("profiles")
    .select("country")
    .eq("id", user.id)
    .single()

  let country: string | null = profile?.country ?? null

  // Auto-detect from Spotify when we don't have one yet (needs user-read-private).
  if (!country) {
    const token = await resolveSpotifyUserToken(session)
    if (token) {
      const res = await spotifyUserFetch("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      if (res?.ok) {
        const me = await res.json()
        if (me.country) {
          country = me.country as string
          await supabase.from("profiles").update({ country }).eq("id", user.id)
        }
      }
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Listening Map</h1>
        <p className="mt-2 text-muted-foreground">
          The world painted by what everyone&apos;s playing — each country shows its #1 artist.
        </p>
      </div>
      <WorldMap userCountry={country} currentUserId={user.id} />
    </div>
  )
}
