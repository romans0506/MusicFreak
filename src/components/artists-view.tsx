"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { Music2, Search, Loader2, X } from "lucide-react"

type SpotifyArtist = {
  id: string
  name: string
  genres: string[]
  popularity: number
  images: { url: string; width: number; height: number }[]
  external_urls?: { spotify: string }
}

const MotionLink = motion(Link)

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
}

const item = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
}

function ArtistCard({ artist }: { artist: SpotifyArtist }) {
  const image = artist.images[0]?.url
  const topGenre = artist.genres?.[0]
  return (
    <MotionLink
      href={`/app/artists/${artist.id}`}
      variants={item}
      whileHover={{ y: -4 }}
      className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-4 text-center transition-colors hover:border-primary/40 hover:bg-card/80"
    >
      {image ? (
        <img
          src={image}
          alt={artist.name}
          className="size-20 rounded-full object-cover outline outline-1 -outline-offset-1 outline-white/10 ring-2 ring-border transition-[box-shadow] duration-150 ease-out group-hover:ring-primary/40 sm:size-24"
        />
      ) : (
        <div className="flex size-20 items-center justify-center rounded-full bg-muted sm:size-24">
          <Music2 className="size-8 text-muted-foreground/40" />
        </div>
      )}
      <div className="w-full">
        <p className="truncate text-sm font-semibold leading-tight">{artist.name}</p>
        {topGenre && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground capitalize">{topGenre}</p>
        )}
      </div>
    </MotionLink>
  )
}

export default function ArtistsView({
  artists,
  error,
}: {
  artists: SpotifyArtist[]
  error: string | null
}) {
  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SpotifyArtist[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchResults([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearching(true)
      fetch(`/api/spotify/search?q=${encodeURIComponent(query)}&type=artist`)
        .then((r) => r.ok ? r.json() : { artists: [] })
        .then((d) => setSearchResults(d.artists ?? []))
        .finally(() => setSearching(false))
    }, 350)
  }, [query])

  const isSearching = query.trim().length >= 2
  const displayArtists = isSearching ? searchResults : artists

  return (
    <div>
      {/* Search bar */}
      <div className="mb-6 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
        {searching ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Search className="size-4 shrink-0 text-muted-foreground" />
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any artist on Spotify…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button onClick={() => setQuery("")}>
            <X className="size-3.5 text-muted-foreground hover:text-foreground transition-colors" />
          </button>
        )}
      </div>

      {/* Error state (only for top artists, not search) */}
      {error && !isSearching && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-20 text-center">
          <Music2 className="size-10 text-muted-foreground/40" />
          <p className="font-medium">Couldn't load artists</p>
          <p className="text-sm text-muted-foreground max-w-xs">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!error && displayArtists.length === 0 && !searching && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-20 text-center">
          <Music2 className="size-10 text-muted-foreground/40" />
          <p className="font-medium">{isSearching ? "No artists found" : "No artists found"}</p>
          <p className="text-sm text-muted-foreground">
            {isSearching ? "Try a different name" : "Listen to more music on Spotify to see your top artists here."}
          </p>
        </div>
      )}

      {/* Section label */}
      {!error && displayArtists.length > 0 && (
        <p className="mb-4 text-xs text-muted-foreground">
          {isSearching ? `Results for "${query}"` : "Your top artists this month"}
        </p>
      )}

      {/* Grid */}
      <AnimatePresence mode="wait">
        {displayArtists.length > 0 && (
          <motion.div
            key={isSearching ? "search" : "top"}
            variants={container}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0 }}
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
          >
            {displayArtists.map((artist) => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
