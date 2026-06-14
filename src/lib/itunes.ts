// Shared iTunes Search API helpers (free, no auth).
// Used by the games that need a catalog Spotify can't give us:
//   - Name That Song (needs the artist's songs + 30s previews)
//   - Lyric → Song "by artist" mode (needs the artist's song list; lyrics
//     themselves come from lrclib)
// Sourcing the song list from iTunes gives the artist's whole catalog, not just
// tracks the user has played.

export type ItunesSong = {
  id: string
  name: string
  /** 30s preview; null for tracks iTunes has no preview for (fine for lyric mode). */
  previewUrl: string | null
  albumArt: string | null
}

export function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}

/** Strip version/feature suffixes so "Song - 2011 Remaster" ≈ "Song (Live)" ≈ "Song". */
export function cleanTitle(name: string): string {
  return name
    .replace(/\s*[([][^)\]]*[)\]]/g, "") // remove (...) and [...]
    .replace(/\s*-\s.*$/, "") // remove " - <suffix>"
    .replace(/\s+/g, " ")
    .trim()
}

/** Loose comparison key: lowercase, strip accents and punctuation. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Find the iTunes artistId that best matches the given name. */
export async function findItunesArtistId(artistName: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=musicArtist&limit=5&country=US`,
      { cache: "no-store" }
    )
    if (!res.ok) return null
    const data = await res.json()
    const results: any[] = data.results ?? []
    if (results.length === 0) return null
    const want = normalize(artistName)
    const exact = results.find((r) => normalize(r.artistName ?? "") === want)
    return (exact ?? results[0]).artistId ?? null
  } catch {
    return null
  }
}

/**
 * Look up an artist's songs by iTunes artistId. Returns de-duplicated tracks
 * (by cleaned title), dropping tracks where the artist is only a feature.
 * `previewUrl` may be null — callers that need audio (Name That Song) should
 * filter on it; lyric mode keeps preview-less tracks too.
 */
export async function songsForArtist(artistId: number, artistName: string): Promise<ItunesSong[]> {
  try {
    const res = await fetch(
      `https://itunes.apple.com/lookup?id=${artistId}&entity=song&limit=200&country=US`,
      { cache: "no-store" }
    )
    if (!res.ok) return []
    const data = await res.json()
    const want = normalize(artistName)

    const seen = new Set<string>()
    const out: ItunesSong[] = []
    for (const r of data.results ?? []) {
      if (r.wrapperType !== "track" || r.kind !== "song") continue
      if (!r.trackName) continue
      // Keep the artist's own tracks (drop tracks where they're only a feature).
      const got = normalize(r.artistName ?? "")
      if (want && !got.includes(want) && !want.includes(got)) continue

      const name = cleanTitle(r.trackName)
      const key = normalize(name)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const albumArt = (r.artworkUrl100 ?? "").replace("100x100", "300x300") || null
      out.push({ id: String(r.trackId), name, previewUrl: r.previewUrl ?? null, albumArt })
    }
    return out
  } catch {
    return []
  }
}
