"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { Music2, Disc3, Mic2, Radio, Heart } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"

type NowPlaying = {
  playing: boolean
  track?: {
    id: string
    name: string
    artists: string
    album: string
    albumArt?: string
    durationMs: number
    progressMs: number
  }
}

type TopStats = {
  topArtists: { id: string; name: string; image?: string; genres?: string[] }[]
  topTracks: { id: string; name: string; artists: string; albumArt?: string; popularity: number }[]
  topAlbums: { id: string; name: string; artist: string; image?: string; count: number }[]
}

function PopularityBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-6">{value}</span>
    </div>
  )
}

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export default function SpotifyStats() {
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null)
  const [stats, setStats] = useState<TopStats | null>(null)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from("favorite_artists")
        .select("artist_id")
        .eq("user_id", user.id)
        .then(({ data }) => {
          if (data) setFavoriteIds(new Set(data.map((r: any) => r.artist_id)))
        })
    })
  }, [])

  useEffect(() => {
    // fetch now playing + poll every 30s
    function fetchNowPlaying() {
      fetch("/api/spotify/currently-playing")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setNowPlaying(d))
    }
    fetchNowPlaying()
    const interval = setInterval(fetchNowPlaying, 30_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    fetch("/api/spotify/top-stats")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setStats(d))
  }, [])

  return (
    <div className="space-y-8">

      {/* Now Playing */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Radio className="size-4 text-primary" />
          <h2 className="text-lg font-semibold">Now Playing</h2>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          {nowPlaying === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="size-3 rounded-full bg-muted animate-pulse" />
              Loading…
            </div>
          ) : nowPlaying.playing && nowPlaying.track ? (
            <div className="flex items-center gap-4">
              {nowPlaying.track.albumArt ? (
                <img
                  src={nowPlaying.track.albumArt}
                  alt={nowPlaying.track.album}
                  className="size-14 rounded-xl object-cover shadow-md shrink-0"
                />
              ) : (
                <div className="flex size-14 items-center justify-center rounded-xl bg-muted shrink-0">
                  <Music2 className="size-6 text-muted-foreground/40" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="flex gap-0.5">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-0.5 bg-primary rounded-full animate-bounce"
                        style={{ height: 12 + i * 4, animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-primary font-medium">Playing</span>
                </div>
                <p className="font-semibold truncate">{nowPlaying.track.name}</p>
                <p className="text-sm text-muted-foreground truncate">{nowPlaying.track.artists} · {nowPlaying.track.album}</p>
                {/* Progress bar */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">{formatTime(nowPlaying.track.progressMs)}</span>
                  <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(nowPlaying.track.progressMs / nowPlaying.track.durationMs) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">{formatTime(nowPlaying.track.durationMs)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex size-10 items-center justify-center rounded-xl bg-muted shrink-0">
                <Music2 className="size-5 text-muted-foreground/40" />
              </div>
              Not playing anything right now
            </div>
          )}
        </div>
      </motion.div>

      {stats && (
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Top Artists */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
            <div className="flex items-center gap-2 mb-3">
              <Mic2 className="size-4 text-primary" />
              <h2 className="text-lg font-semibold">Top Artists</h2>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {stats.topArtists.map((artist, i) => (
                <Link
                  key={artist.id}
                  href={`/app/artists/${artist.id}`}
                  className={cn("flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40", i < stats.topArtists.length - 1 && "border-b border-border")}
                >
                  <span className="w-4 text-xs text-muted-foreground shrink-0">#{i + 1}</span>
                  {artist.image ? (
                    <img src={artist.image} alt={artist.name} className="size-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="flex size-9 items-center justify-center rounded-full bg-muted shrink-0">
                      <Mic2 className="size-4 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{artist.name}</p>
                    {artist.genres?.[0] && <p className="truncate text-xs text-muted-foreground capitalize">{artist.genres[0]}</p>}
                  </div>
                  {favoriteIds.has(artist.id) && (
                    <Heart className="size-3.5 shrink-0 fill-primary text-primary" />
                  )}
                </Link>
              ))}
            </div>
          </motion.div>

          {/* Top Albums */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}>
            <div className="flex items-center gap-2 mb-3">
              <Disc3 className="size-4 text-primary" />
              <h2 className="text-lg font-semibold">Top Albums</h2>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {stats.topAlbums.map((album, i) => (
                <a
                  key={album.id}
                  href={`https://open.spotify.com/album/${album.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn("flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40", i < stats.topAlbums.length - 1 && "border-b border-border")}
                >
                  <span className="w-4 text-xs text-muted-foreground shrink-0">#{i + 1}</span>
                  {album.image ? (
                    <img src={album.image} alt={album.name} className="size-9 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="flex size-9 items-center justify-center rounded-lg bg-muted shrink-0">
                      <Disc3 className="size-4 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{album.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{album.artist}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{album.count} tracks</span>
                </a>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* Top Tracks */}
      {stats && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }}>
          <div className="flex items-center gap-2 mb-3">
            <Music2 className="size-4 text-primary" />
            <h2 className="text-lg font-semibold">Top Songs</h2>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {stats.topTracks.map((track, i) => (
              <a
                key={track.id}
                href={`https://open.spotify.com/track/${track.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn("flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40", i < stats.topTracks.length - 1 && "border-b border-border")}
              >
                <span className="w-4 text-xs text-muted-foreground shrink-0">#{i + 1}</span>
                {track.albumArt ? (
                  <img src={track.albumArt} alt={track.name} className="size-9 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="flex size-9 items-center justify-center rounded-lg bg-muted shrink-0">
                    <Music2 className="size-4 text-muted-foreground/40" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{track.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{track.artists}</p>
                </div>
                <PopularityBar value={track.popularity} />
              </a>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}
