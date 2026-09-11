// Live/tour dates from the Ticketmaster Discovery API.
//
// Spotify has no concerts endpoint, so tour dates come from Ticketmaster —
// the only provider with a self-serve key (5000 req/day, ~5 req/s). Coverage
// is good for arena/theatre shows in NA, UK and most of the EU and thin for
// small clubs, so "no events" means "none that Ticketmaster sells".
//
// Caches are in-memory (same as the Spotify token cache): fine for a single
// instance, reset on cold start. Swap for Redis if this ever runs multi-instance.

const TM_BASE = "https://app.ticketmaster.com/discovery/v2"

// Only the slice of Ticketmaster's payloads we actually read. Everything is
// optional because Discovery omits fields freely (TBA times, venue-less events).
type TmImage = { url?: string; width?: number; ratio?: string }
type TmAttraction = { id?: string; name?: string; externalLinks?: { spotify?: { url?: string }[] } }
type TmVenue = { name?: string; city?: { name?: string }; country?: { countryCode?: string } }
type TmEvent = {
  id?: string
  name?: string
  url?: string
  images?: TmImage[]
  dates?: {
    start?: { localDate?: string; localTime?: string; timeTBA?: boolean; noSpecificTime?: boolean }
    status?: { code?: string }
  }
  _embedded?: { venues?: TmVenue[] }
}
type TmResponse = { _embedded?: { attractions?: TmAttraction[]; events?: TmEvent[] } }

export type LiveEvent = {
  id: string
  name: string
  /** Ticketmaster event page — where the tickets actually are. */
  url: string
  /** Local calendar date, "YYYY-MM-DD". Always present. */
  date: string
  /** Local start time "HH:MM:SS", or null when the time is still TBA. */
  time: string | null
  venue: string | null
  city: string | null
  /** ISO alpha-2, so the UI can reuse the flagcdn.com images. */
  country: string | null
  image: string | null
}

/** False when TICKETMASTER_API_KEY isn't set — callers then render nothing. */
export function hasTicketmaster(): boolean {
  return !!process.env.TICKETMASTER_API_KEY
}

// Ticketmaster's quota is a daily one, not a short burst window like Spotify's,
// so a 429 here means we've been noisy and should stop entirely for a while.
let rateLimitedUntil = 0

function cooldown(): number {
  const now = Date.now()
  return rateLimitedUntil > now ? Math.ceil((rateLimitedUntil - now) / 1000) : 0
}

function note429(retryAfterHeader?: string | null) {
  const secs = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN
  const waitMs = (Number.isFinite(secs) ? secs : 300) * 1000
  rateLimitedUntil = Date.now() + waitMs
  console.warn(`[ticketmaster] 429 received — backing off for ${waitMs / 1000}s`)
}

/**
 * Spotify artist id → Ticketmaster attraction id. Attractions barely change, so
 * this is cached for a week; misses are cached for an hour so an artist who
 * simply isn't on Ticketmaster doesn't cost a lookup on every page view.
 */
const attractionCache = new Map<string, { id: string | null; expiresAt: number }>()
const eventsCache = new Map<string, { events: LiveEvent[]; expiresAt: number }>()
/** Concurrent viewers of the same artist page share one lookup. */
const inflight = new Map<string, Promise<EventsLookup>>()

/**
 * `cacheable` is false when Ticketmaster never answered. A failed lookup must
 * not be cached as "no upcoming shows", or one network blip hides a touring
 * artist for the whole empty-result TTL.
 */
type EventsLookup = { events: LiveEvent[]; cacheable: boolean }

const ATTRACTION_TTL_MS = 7 * 24 * 60 * 60_000
const ATTRACTION_MISS_TTL_MS = 60 * 60_000
const EVENTS_TTL_MS = 6 * 60 * 60_000
const EVENTS_EMPTY_TTL_MS = 30 * 60_000

async function tmFetch(path: string, params: Record<string, string>): Promise<TmResponse | null> {
  const key = process.env.TICKETMASTER_API_KEY
  if (!key) return null
  if (cooldown() > 0) return null

  const query = new URLSearchParams({ ...params, apikey: key })
  try {
    const res = await fetch(`${TM_BASE}/${path}?${query}`, { cache: "no-store" })
    if (res.status === 429) {
      note429(res.headers.get("retry-after"))
      return null
    }
    // 404 is Ticketmaster's "nothing matched" on some paths — not an error.
    if (res.status === 404) return null
    if (!res.ok) {
      console.error("[ticketmaster]", path, res.status, await res.text())
      return null
    }
    return (await res.json()) as TmResponse
  } catch (err) {
    console.error("[ticketmaster] request failed", path, err)
    return null
  }
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}

/** Prefer a wide, reasonably large image; Ticketmaster returns a dozen crops. */
function pickImage(images: TmImage[] | undefined): string | null {
  if (!images?.length) return null
  const wide = images
    .filter((i) => i?.url && (i.width ?? 0) >= 640 && (i.ratio === "16_9" || !i.ratio))
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]
  return wide?.url ?? images.find((i) => i?.url)?.url ?? null
}

/**
 * One night at one venue often comes back as several listings (presale link,
 * main event page, multi-day package). Keep one row per date+venue, preferring
 * a ticketmaster.com URL with a real start time over a TBA package.
 */
function listingScore(e: LiveEvent): number {
  return (e.url.includes("ticketmaster.") ? 2 : 0) + (e.time ? 1 : 0)
}

function dedupe(events: LiveEvent[]): LiveEvent[] {
  const best = new Map<string, LiveEvent>()
  for (const e of events) {
    const key = `${e.date}|${(e.venue ?? e.city ?? "").toLowerCase()}`
    const current = best.get(key)
    if (!current || listingScore(e) > listingScore(current)) best.set(key, e)
  }
  // Insertion order is Ticketmaster's date,asc order, and overwriting a key
  // keeps its original slot — so the result stays sorted by date.
  return [...best.values()]
}

/**
 * Resolve the Ticketmaster attraction for a Spotify artist.
 *
 * Name search alone is a trap — tribute acts, covers bands and unrelated events
 * share names with the real thing, and showing the wrong band's tour is worse
 * than showing nothing. Attractions carry an `externalLinks.spotify` array, so
 * we match on the Spotify id we already have, and fall back to an exact name
 * match only for candidates that declare no Spotify link at all.
 */
async function resolveAttractionId(
  spotifyArtistId: string,
  artistName: string
): Promise<{ ok: boolean; id: string | null }> {
  const cached = attractionCache.get(spotifyArtistId)
  if (cached && cached.expiresAt > Date.now()) return { ok: true, id: cached.id }

  const data = await tmFetch("attractions.json", {
    keyword: artistName,
    classificationName: "music",
    size: "10",
  })
  // Don't cache a failed request as a miss; `ok: false` also tells the caller
  // not to cache an empty event list for it.
  if (!data) return { ok: false, id: cached?.id ?? null }

  const candidates: TmAttraction[] = data._embedded?.attractions ?? []
  const wanted = normalize(artistName)

  const bySpotify = candidates.find((a) =>
    (a.externalLinks?.spotify ?? []).some((l) => l?.url?.includes(spotifyArtistId))
  )
  const byName = candidates.find(
    (a) => normalize(a.name ?? "") === wanted && !a.externalLinks?.spotify?.length
  )
  const id: string | null = bySpotify?.id ?? byName?.id ?? null

  attractionCache.set(spotifyArtistId, {
    id: id ?? null,
    expiresAt: Date.now() + (id ? ATTRACTION_TTL_MS : ATTRACTION_MISS_TTL_MS),
  })
  return { ok: true, id }
}

/**
 * Upcoming shows for a Spotify artist, soonest first. Returns [] for every
 * failure mode (no key, cool-down, unknown artist, nothing on sale) — the UI
 * treats "no events" as a normal state, not an error.
 */
export async function getArtistEvents(
  spotifyArtistId: string,
  artistName: string,
  limit = 40
): Promise<LiveEvent[]> {
  if (!hasTicketmaster() || !artistName.trim()) return []

  const cached = eventsCache.get(spotifyArtistId)
  if (cached && cached.expiresAt > Date.now()) return cached.events.slice(0, limit)

  const existing = inflight.get(spotifyArtistId)
  if (existing) return (await existing).events.slice(0, limit)

  const request = (async (): Promise<EventsLookup> => {
    const attraction = await resolveAttractionId(spotifyArtistId, artistName)
    // Lookup failed: serve what we have, cache nothing.
    if (!attraction.ok) return { events: cached?.events ?? [], cacheable: false }
    // Answered, and the artist isn't on Ticketmaster.
    if (!attraction.id) return { events: [], cacheable: true }

    // These are listings, not shows — dedupe collapses them roughly 2:1, so
    // fetch generously (max is 200) or long tours get truncated before dedupe.
    // Discovery returns upcoming events only; date,asc puts the next show first.
    const data = await tmFetch("events.json", {
      attractionId: attraction.id,
      sort: "date,asc",
      size: "100",
      classificationName: "music",
    })
    // Serve the stale list rather than blanking the section on a failed refresh.
    if (!data) return { events: cached?.events ?? [], cacheable: false }

    const events: LiveEvent[] = []
    for (const e of data._embedded?.events ?? []) {
      const start = e.dates?.start
      if (!e.id || !start?.localDate) continue
      if (e.dates?.status?.code === "cancelled") continue

      const venue = e._embedded?.venues?.[0]
      events.push({
        id: e.id,
        name: e.name ?? artistName,
        url: e.url ?? "",
        date: start.localDate,
        // A TBA event still carries a localDate, but its localTime is a
        // placeholder — show the date alone rather than an invented 00:00.
        time: start.timeTBA || start.noSpecificTime ? null : start.localTime ?? null,
        venue: venue?.name ?? null,
        city: venue?.city?.name ?? null,
        country: venue?.country?.countryCode ?? null,
        image: pickImage(e.images),
      })
    }
    return { events: dedupe(events), cacheable: true }
  })()

  inflight.set(spotifyArtistId, request)
  try {
    const { events, cacheable } = await request
    if (cacheable) {
      eventsCache.set(spotifyArtistId, {
        events,
        expiresAt: Date.now() + (events.length ? EVENTS_TTL_MS : EVENTS_EMPTY_TTL_MS),
      })
    }
    return events.slice(0, limit)
  } finally {
    inflight.delete(spotifyArtistId)
  }
}
