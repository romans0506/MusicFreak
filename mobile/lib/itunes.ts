// iTunes Search API helpers (free, no auth) — hand-copied port of the web app's
// src/lib/itunes.ts. There is no shared package between the two projects, so a
// change to one must be mirrored in the other (same rule as lib/stats.ts).
//
// This is the catalog source for the games, and it matters more here than on
// web: the device has no app token, so /v1/search and the Spotify discography
// endpoints are simply unavailable (see the table in docs/mobile.md). iTunes is
// keyless, so it needs no Spotify session at all.
//
// Used by:
//   - Name That Song   → the artist's songs AND their 30s previews
//   - Lyric → Song     → the artist's song list ("by artist" mode; the lyrics
//                        themselves come from lrclib)
//   - the artist picker → searching for any artist at all
//
// Differences from the web copy, both forced by the platform:
//   - no `cache: "no-store"` — React Native's fetch has no HTTP cache to opt out of
//   - `shuffle` is Fisher-Yates rather than `sort(() => Math.random() - 0.5)`,
//     which is measurably biased; here it decides which option holds the
//     correct answer, so an even spread is worth the four extra lines.

export type ItunesSong = {
  id: string
  name: string
  /** 30s preview; null for tracks iTunes has no preview for (fine for lyric mode). */
  previewUrl: string | null
  albumArt: string | null
}

export type ItunesArtist = { id: number; name: string }

export function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
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
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

async function itunes(path: string): Promise<any | null> {
  try {
    const res = await fetch(`https://itunes.apple.com/${path}`)
    if (!res.ok) return null
    // iTunes serves JSON as text/javascript, which some fetch stacks refuse to
    // parse via res.json(). Parse the body ourselves.
    return JSON.parse(await res.text())
  } catch {
    return null
  }
}

/** Find the iTunes artistId that best matches the given name. */
export async function findItunesArtistId(artistName: string): Promise<number | null> {
  const data = await itunes(
    `search?term=${encodeURIComponent(artistName)}&entity=musicArtist&limit=5&country=US`,
  )
  const results: any[] = data?.results ?? []
  if (results.length === 0) return null
  const want = normalize(artistName)
  const exact = results.find((r) => normalize(r.artistName ?? "") === want)
  return (exact ?? results[0]).artistId ?? null
}

/**
 * Search artists by name — the device's replacement for /v1/search, which needs
 * an app token. Returns id + name only; iTunes has no artist photo (see
 * `artistArtwork` for the stand-in).
 */
export async function searchItunesArtists(query: string, limit = 12): Promise<ItunesArtist[]> {
  const data = await itunes(
    `search?term=${encodeURIComponent(query)}&entity=musicArtist&limit=${limit}&country=US`,
  )
  const seen = new Set<string>()
  const out: ItunesArtist[] = []
  for (const r of data?.results ?? []) {
    const name = r.artistName
    if (!name || !r.artistId) continue
    const key = normalize(name)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id: r.artistId, name })
  }
  return out
}

/**
 * A picture for an artist iTunes only knows by id: their most recent album
 * cover. Not a portrait — iTunes exposes no artist photos — but it beats a
 * letter tile on the Name That Song hero, and it never spoils an answer there
 * (the game asks for song titles, and the cover isn't tied to the clip).
 */
export async function artistArtwork(artistId: number): Promise<string | null> {
  const data = await itunes(`lookup?id=${artistId}&entity=album&limit=1&country=US`)
  const album = (data?.results ?? []).find((r: any) => r.wrapperType === "collection")
  const art: string | undefined = album?.artworkUrl100
  return art ? art.replace("100x100", "600x600") : null
}

/**
 * Look up an artist's songs by iTunes artistId. Returns de-duplicated tracks
 * (by cleaned title), dropping tracks where the artist is only a feature.
 * `previewUrl` may be null — callers that need audio (Name That Song) should
 * filter on it; lyric mode keeps preview-less tracks too.
 */
export async function songsForArtist(artistId: number, artistName: string): Promise<ItunesSong[]> {
  const data = await itunes(`lookup?id=${artistId}&entity=song&limit=200&country=US`)
  if (!data) return []
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
}
