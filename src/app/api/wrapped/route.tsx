import { ImageResponse } from "next/og"
import { createClient } from "@/lib/supabase/server"
import { getSpotifyAppToken } from "@/lib/spotify"
import { computeStreak } from "@/lib/stats"

// Spotify-Wrapped-style palette: vibrant gradient, white panels, bright accent.
const ACCENT = "#ffe14d" // pop yellow for big numbers / ranks
const WHITE = "#ffffff"
const SOFT = "rgba(255,255,255,0.72)"
const PANEL = "rgba(255,255,255,0.12)"

type TrackRow = { track_id: string; name: string; artists: string | null; album_art: string | null; play_count: number }
type ArtistRow = { artist_id: string | null; artist: string; play_count: number; total_ms: number }
type AlbumRow = { album_id: string; album_name: string; album_art: string | null; play_count: number }

const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()

  const [{ data: tracksRaw }, { data: artistsRaw }, { data: albumsRaw }, { data: daysRaw }, { data: profile }] =
    await Promise.all([
      supabase.rpc("get_play_counts", { p_since: monthAgo }).limit(5),
      supabase.rpc("get_top_artists", { p_since: monthAgo }).limit(3),
      supabase.rpc("get_top_albums", { p_since: monthAgo }).limit(3),
      supabase.rpc("get_play_days", { p_tz: "UTC" }),
      supabase.from("profiles").select("username").eq("id", user.id).single(),
    ])

  const topTracks = (tracksRaw as TrackRow[]) ?? []
  const topArtists = (artistsRaw as ArtistRow[]) ?? []
  const topAlbums = (albumsRaw as AlbumRow[]) ?? []

  const days = ((daysRaw as { day: string }[]) ?? []).map((d) => d.day)
  const { current: streak } = computeStreak(days, new Date().toISOString().slice(0, 10))

  const mainArtist = topArtists[0]
  const mainArtistMinutes = mainArtist ? Math.round(Number(mainArtist.total_ms) / 60_000) : 0

  // Artist photos aren't in recently-played — look them up from the catalog.
  const artistImages: Record<string, string> = {}
  const artistIds = topArtists.map((a) => a.artist_id).filter(Boolean) as string[]
  if (artistIds.length > 0) {
    const appToken = await getSpotifyAppToken()
    if (appToken) {
      const res = await fetch(`https://api.spotify.com/v1/artists?ids=${artistIds.join(",")}`, {
        headers: { Authorization: `Bearer ${appToken}` },
        cache: "no-store",
      })
      if (res.ok) {
        const data = await res.json()
        for (const a of data.artists ?? []) {
          if (a?.id && a.images?.[0]?.url) artistImages[a.id] = a.images[a.images.length - 1]?.url ?? a.images[0].url
        }
      }
    }
  }
  const mainArtistImage = mainArtist?.artist_id ? artistImages[mainArtist.artist_id] : undefined

  const displayName =
    profile?.username ??
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email?.split("@")[0] ??
    "MusicFreak"

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 72,
          fontFamily: "sans-serif",
          color: WHITE,
          backgroundImage: "linear-gradient(145deg, #ff3d6e 0%, #d62246 38%, #7b1fa2 100%)",
        }}
      >
        {/* Eyebrow + name + streak pill */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: 4, color: ACCENT }}>
              MUSICFREAK WRAPPED
            </div>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 700, marginTop: 8 }}>
              {trunc(displayName, 22)} · last 30 days
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, backgroundColor: PANEL, borderRadius: 999, padding: "14px 24px", fontSize: 32, fontWeight: 700 }}>
            {streak}🔥
          </div>
        </div>

        {/* HERO: minutes with the main artist + their photo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 40, marginBottom: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", fontSize: 170, fontWeight: 900, lineHeight: 1, color: ACCENT }}>
              {mainArtistMinutes.toLocaleString("en")}
            </div>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 700, marginTop: 6 }}>
              minutes {mainArtist ? `with ${trunc(mainArtist.artist, 18)}` : "this month"}
            </div>
          </div>
          {mainArtistImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mainArtistImage}
              width={220}
              height={220}
              style={{ borderRadius: 999, border: `6px solid ${ACCENT}` }}
              alt=""
            />
          )}
        </div>

        {/* Top Songs */}
        <div style={{ display: "flex", fontSize: 34, fontWeight: 800, marginBottom: 16 }}>Top Songs</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {topTracks.length === 0 ? (
            <div style={{ display: "flex", fontSize: 28, color: SOFT }}>Start listening on Spotify to fill this in.</div>
          ) : (
            topTracks.map((t, i) => (
              <div key={t.track_id} style={{ display: "flex", alignItems: "center", gap: 18, backgroundColor: PANEL, borderRadius: 18, padding: 14 }}>
                <div style={{ display: "flex", fontSize: 32, fontWeight: 900, color: ACCENT, width: 38 }}>{i + 1}</div>
                {t.album_art ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.album_art} width={64} height={64} style={{ borderRadius: 10 }} alt="" />
                ) : (
                  <div style={{ display: "flex", width: 64, height: 64, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)" }} />
                )}
                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", fontSize: 28, fontWeight: 700 }}>{trunc(t.name, 28)}</div>
                  <div style={{ display: "flex", fontSize: 22, color: SOFT, marginTop: 2 }}>{trunc(t.artists ?? "", 32)}</div>
                </div>
                <div style={{ display: "flex", fontSize: 26, fontWeight: 800 }}>{Number(t.play_count)}×</div>
              </div>
            ))
          )}
        </div>

        {/* Top Artists + Albums */}
        <div style={{ display: "flex", gap: 24, marginTop: 36, flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 800, marginBottom: 16 }}>Top Artists</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {topArtists.map((a, i) => {
                const img = a.artist_id ? artistImages[a.artist_id] : undefined
                return (
                  <div key={a.artist_id ?? a.artist} style={{ display: "flex", alignItems: "center", gap: 14, backgroundColor: PANEL, borderRadius: 16, padding: 14 }}>
                    <div style={{ display: "flex", fontSize: 28, fontWeight: 900, color: ACCENT, width: 28 }}>{i + 1}</div>
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} width={56} height={56} style={{ borderRadius: 999 }} alt="" />
                    ) : (
                      <div style={{ display: "flex", width: 56, height: 56, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.2)" }} />
                    )}
                    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                      <div style={{ display: "flex", fontSize: 25, fontWeight: 700 }}>{trunc(a.artist, 16)}</div>
                      <div style={{ display: "flex", fontSize: 19, color: SOFT, marginTop: 2 }}>{Number(a.play_count)} plays</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 800, marginBottom: 16 }}>Top Albums</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {topAlbums.map((al, i) => (
                <div key={al.album_id} style={{ display: "flex", alignItems: "center", gap: 12, backgroundColor: PANEL, borderRadius: 16, padding: 12 }}>
                  <div style={{ display: "flex", fontSize: 27, fontWeight: 900, color: ACCENT, width: 26 }}>{i + 1}</div>
                  {al.album_art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={al.album_art} width={56} height={56} style={{ borderRadius: 8 }} alt="" />
                  ) : (
                    <div style={{ display: "flex", width: 56, height: 56, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.2)" }} />
                  )}
                  <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                    <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>{trunc(al.album_name, 16)}</div>
                    <div style={{ display: "flex", fontSize: 19, color: SOFT, marginTop: 2 }}>{Number(al.play_count)} plays</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 20, fontSize: 26, fontWeight: 700, color: SOFT }}>
          musicfreak.app
        </div>
      </div>
    ),
    { width: 1080, height: 1920 }
  )
}
