"use client"

import { useState, useEffect } from "react"
import { Search } from "lucide-react"

export type PickArtist = { id: string; name: string; image: string | null }

/**
 * Reusable artist picker: shows the user's top artists by default and live
 * search results once you type. Used by Lyric → Song's "by artist" mode.
 * (Name That Song has its own inline copy of this UI.)
 */
export default function ArtistPicker({ onPick }: { onPick: (artist: PickArtist) => void }) {
  const [topArtists, setTopArtists] = useState<PickArtist[]>([])
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PickArtist[]>([])

  // Load top artists for quick-pick.
  useEffect(() => {
    fetch("/api/spotify/top-stats")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.topArtists)) {
          setTopArtists(d.topArtists.map((a: any) => ({ id: a.id, name: a.name, image: a.image ?? null })))
        }
      })
      .catch(() => {})
  }, [])

  // Debounced artist search.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/spotify/search?type=artist&q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults((data.artists ?? []).map((a: any) => ({ id: a.id, name: a.name, image: a.images?.[0]?.url ?? null })))
      } catch {
        setResults([])
      }
    }, 350)
    return () => clearTimeout(t)
  }, [query])

  const list = query.trim().length >= 2 ? results : topArtists

  return (
    <div>
      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for an artist…"
          className="w-full rounded-full border border-border bg-card py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary/50"
        />
      </div>

      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {query.trim().length >= 2 ? "Results" : "Your top artists"}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {list.map((a) => (
          <button
            key={a.id}
            onClick={() => onPick(a)}
            className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-4 text-center transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            {a.image ? (
              <img src={a.image} alt={a.name} className="size-20 rounded-full object-cover" />
            ) : (
              <div className="flex size-20 items-center justify-center rounded-full bg-muted text-2xl font-bold text-muted-foreground">
                {a.name[0]?.toUpperCase()}
              </div>
            )}
            <span className="line-clamp-2 text-sm font-medium">{a.name}</span>
          </button>
        ))}
        {list.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
            {query.trim().length >= 2 ? "No artists found." : "Loading your artists…"}
          </p>
        )}
      </div>
    </div>
  )
}
