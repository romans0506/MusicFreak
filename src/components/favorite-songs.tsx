"use client"

import { useState, useEffect, useRef, useTransition } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Music2, Heart, Loader2, X, Play, Pause } from "lucide-react"
import { cn } from "@/lib/utils"
import { toggleFavoriteSong } from "@/app/app/profile/actions"

type Track = {
  id: string
  name: string
  artists: string
  artistIds?: string[]
  albumArt: string | null
  durationMs?: number
  previewUrl?: string | null
}

type FavoriteSong = {
  id: string
  track_id: string
  name: string
  artists: string
  album_art: string | null
}

type Props = {
  initialFavorites: FavoriteSong[]
}

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export default function FavoriteSongs({ initialFavorites }: Props) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Track[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [favorites, setFavorites] = useState<FavoriteSong[]>(initialFavorites)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      setShowResults(false)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearching(true)
      fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.ok ? r.json() : { tracks: [] })
        .then((d) => {
          setResults(d.tracks ?? [])
          setShowResults(true)
        })
        .finally(() => setSearching(false))
    }, 350)
  }, [query])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  function isFavorited(trackId: string) {
    return favorites.some((f) => f.track_id === trackId)
  }

  function handleToggle(track: Track) {
    const already = isFavorited(track.id)
    if (already) {
      setFavorites((prev) => prev.filter((f) => f.track_id !== track.id))
    } else {
      setFavorites((prev) => [
        ...prev,
        { id: crypto.randomUUID(), track_id: track.id, name: track.name, artists: track.artists, album_art: track.albumArt },
      ])
    }
    startTransition(async () => {
      const res = await toggleFavoriteSong(
        { id: track.id, name: track.name, artists: track.artists, albumArt: track.albumArt, artistIds: track.artistIds },
        already
      )
      if (res.error) {
        // revert
        if (already) {
          setFavorites((prev) => [
            ...prev,
            { id: crypto.randomUUID(), track_id: track.id, name: track.name, artists: track.artists, album_art: track.albumArt },
          ])
        } else {
          setFavorites((prev) => prev.filter((f) => f.track_id !== track.id))
        }
      }
    })
  }

  function handlePlay(track: Track) {
    if (!track.previewUrl) return
    if (playingId === track.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    audioRef.current?.pause()
    const audio = new Audio(track.previewUrl)
    audio.volume = 0.7
    audio.play()
    audio.onended = () => setPlayingId(null)
    audioRef.current = audio
    setPlayingId(track.id)
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Heart className="size-4 text-primary" />
        <h2 className="text-lg font-semibold">Favorite Songs</h2>
      </div>

      {/* Search */}
      <div ref={wrapperRef} className="relative mb-4">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          {searching ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <Search className="size-4 shrink-0 text-muted-foreground" />
          )}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            placeholder="Search for a song…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => { setQuery(""); setResults([]); setShowResults(false) }}>
              <X className="size-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>

        {/* Dropdown results */}
        <AnimatePresence>
          {showResults && results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-xl"
            >
              {results.map((track, i) => {
                const favorited = isFavorited(track.id)
                const isPlaying = playingId === track.id
                return (
                  <div
                    key={track.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5",
                      i < results.length - 1 && "border-b border-border"
                    )}
                  >
                    {/* Album art + play */}
                    <div
                      className="relative shrink-0 cursor-pointer"
                      onClick={() => handlePlay(track)}
                    >
                      {track.albumArt ? (
                        <img src={track.albumArt} alt={track.name} className="size-9 rounded-md object-cover" />
                      ) : (
                        <div className="flex size-9 items-center justify-center rounded-md bg-muted">
                          <Music2 className="size-4 text-muted-foreground/40" />
                        </div>
                      )}
                      {track.previewUrl && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
                          {isPlaying ? <Pause className="size-3 fill-white text-white" /> : <Play className="size-3 fill-white text-white" />}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{track.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{track.artists}</p>
                    </div>

                    {track.durationMs && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatDuration(track.durationMs)}
                      </span>
                    )}

                    <button
                      onClick={() => handleToggle(track)}
                      className={cn(
                        "shrink-0 rounded-full p-1.5 transition-colors",
                        favorited
                          ? "text-primary hover:bg-primary/10"
                          : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                      )}
                    >
                      <Heart className={cn("size-4", favorited && "fill-current")} />
                    </button>
                  </div>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Saved favorites list */}
      {favorites.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card py-10 text-center">
          <Heart className="size-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Search above to add your favorite songs</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <AnimatePresence initial={false}>
            {favorites.map((fav, i) => {
              const isPlaying = playingId === fav.track_id
              return (
                <motion.div
                  key={fav.track_id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div
                    className={cn(
                      "flex items-center gap-3 px-4 py-3",
                      i < favorites.length - 1 && "border-b border-border"
                    )}
                  >
                    {fav.album_art ? (
                      <img src={fav.album_art} alt={fav.name} className="size-9 shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Music2 className="size-4 text-muted-foreground/40" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{fav.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{fav.artists}</p>
                    </div>
                    <button
                      onClick={() => handleToggle({ id: fav.track_id, name: fav.name, artists: fav.artists, albumArt: fav.album_art })}
                      className="shrink-0 rounded-full p-1.5 text-primary transition-colors hover:bg-primary/10"
                    >
                      <Heart className="size-4 fill-current" />
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
