// Supabase Edge Function (Deno) — upcoming Ticketmaster shows for an artist.
//
// The mobile app can't hold the Ticketmaster key (anything Expo inlines ships
// in the bundle), so the key lives in Supabase secrets and the phone calls
// this with its session.
//
// Port of src/lib/ticketmaster.ts — Deno can't import from the Next.js tree.
// Keep the two in sync, especially the Spotify-id matching.
//
// Deploy: `supabase functions deploy artist-events`, then add
// TICKETMASTER_API_KEY under Edge Functions → Secrets. Keep "Verify JWT" on;
// it is the only auth gate, and the daily quota is shared by everyone.

const TM_BASE = "https://app.ticketmaster.com/discovery/v2";

type TmImage = { url?: string; width?: number; ratio?: string };
type TmAttraction = { id?: string; name?: string; externalLinks?: { spotify?: { url?: string }[] } };
type TmVenue = { name?: string; city?: { name?: string }; country?: { countryCode?: string } };
type TmEvent = {
  id?: string;
  name?: string;
  url?: string;
  images?: TmImage[];
  dates?: {
    start?: { localDate?: string; localTime?: string; timeTBA?: boolean; noSpecificTime?: boolean };
    status?: { code?: string };
  };
  _embedded?: { venues?: TmVenue[] };
};
type TmResponse = { _embedded?: { attractions?: TmAttraction[]; events?: TmEvent[] } };

type LiveEvent = {
  id: string;
  name: string;
  url: string;
  date: string;
  time: string | null;
  venue: string | null;
  city: string | null;
  country: string | null;
  image: string | null;
};

const SPOTIFY_ID = /^[0-9A-Za-z]{10,40}$/;

// Module scope survives between invocations while the instance stays warm, so
// this is a real cache most of the time and simply a cold start otherwise.
const attractionCache = new Map<string, { id: string | null; expiresAt: number }>();
const eventsCache = new Map<string, { events: LiveEvent[]; expiresAt: number }>();

const ATTRACTION_TTL_MS = 7 * 24 * 60 * 60_000;
const ATTRACTION_MISS_TTL_MS = 60 * 60_000;
const EVENTS_TTL_MS = 6 * 60 * 60_000;
const EVENTS_EMPTY_TTL_MS = 30 * 60_000;

let rateLimitedUntil = 0;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function tmFetch(path: string, params: Record<string, string>): Promise<TmResponse | null> {
  const key = Deno.env.get("TICKETMASTER_API_KEY");
  if (!key) return null;
  if (Date.now() < rateLimitedUntil) return null;

  const query = new URLSearchParams({ ...params, apikey: key });
  try {
    const res = await fetch(`${TM_BASE}/${path}?${query}`);
    if (res.status === 429) {
      const secs = parseInt(res.headers.get("retry-after") ?? "", 10);
      rateLimitedUntil = Date.now() + (Number.isFinite(secs) ? secs : 300) * 1000;
      console.warn("[ticketmaster] 429 — backing off");
      return null;
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error("[ticketmaster]", path, res.status, await res.text());
      return null;
    }
    return (await res.json()) as TmResponse;
  } catch (err) {
    console.error("[ticketmaster] request failed", path, err);
    return null;
  }
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function pickImage(images: TmImage[] | undefined): string | null {
  if (!images?.length) return null;
  const wide = images
    .filter((i) => i?.url && (i.width ?? 0) >= 640 && (i.ratio === "16_9" || !i.ratio))
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  return wide?.url ?? images.find((i) => i?.url)?.url ?? null;
}

/**
 * One night at one venue often comes back as several listings (presale link,
 * main event page, multi-day package). Keep one row per date+venue, preferring
 * a ticketmaster.com URL with a real start time over a TBA package.
 */
function listingScore(e: LiveEvent): number {
  return (e.url.includes("ticketmaster.") ? 2 : 0) + (e.time ? 1 : 0);
}

function dedupe(events: LiveEvent[]): LiveEvent[] {
  const best = new Map<string, LiveEvent>();
  for (const e of events) {
    const key = `${e.date}|${(e.venue ?? e.city ?? "").toLowerCase()}`;
    const current = best.get(key);
    if (!current || listingScore(e) > listingScore(current)) best.set(key, e);
  }
  // Insertion order is Ticketmaster's date,asc order, and overwriting a key
  // keeps its original slot — so the result stays sorted by date.
  return [...best.values()];
}

/**
 * Match on the Spotify id, never on the name alone — tribute acts and covers
 * bands share names with the real thing, and the wrong band's tour is worse
 * than no tour. An exact name match is the fallback only for candidates that
 * declare no Spotify link at all; otherwise we return null and show nothing.
 */
async function resolveAttractionId(
  spotifyArtistId: string,
  artistName: string,
): Promise<{ ok: boolean; id: string | null }> {
  const cached = attractionCache.get(spotifyArtistId);
  if (cached && cached.expiresAt > Date.now()) return { ok: true, id: cached.id };

  const data = await tmFetch("attractions.json", {
    keyword: artistName,
    classificationName: "music",
    size: "10",
  });
  // Don't cache a failed request as a miss; `ok: false` also tells the caller
  // not to cache an empty event list for it.
  if (!data) return { ok: false, id: cached?.id ?? null };

  const candidates: TmAttraction[] = data._embedded?.attractions ?? [];
  const wanted = normalize(artistName);

  const bySpotify = candidates.find((a) =>
    (a.externalLinks?.spotify ?? []).some((l) => l?.url?.includes(spotifyArtistId)),
  );
  const byName = candidates.find(
    (a) => normalize(a.name ?? "") === wanted && !a.externalLinks?.spotify?.length,
  );
  const id: string | null = bySpotify?.id ?? byName?.id ?? null;

  attractionCache.set(spotifyArtistId, {
    id,
    expiresAt: Date.now() + (id ? ATTRACTION_TTL_MS : ATTRACTION_MISS_TTL_MS),
  });
  return { ok: true, id };
}

async function getArtistEvents(spotifyArtistId: string, artistName: string): Promise<LiveEvent[]> {
  const cached = eventsCache.get(spotifyArtistId);
  if (cached && cached.expiresAt > Date.now()) return cached.events;

  const attraction = await resolveAttractionId(spotifyArtistId, artistName);
  // Lookup failed: serve what we have, cache nothing.
  if (!attraction.ok) return cached?.events ?? [];
  // Answered, and the artist isn't on Ticketmaster.
  if (!attraction.id) {
    eventsCache.set(spotifyArtistId, { events: [], expiresAt: Date.now() + EVENTS_EMPTY_TTL_MS });
    return [];
  }

  const data = await tmFetch("events.json", {
    attractionId: attraction.id,
    sort: "date,asc",
    // Listings, not shows — dedupe collapses them ~2:1, so fetch generously.
    size: "100",
    classificationName: "music",
  });
  // Serve the stale list rather than blanking the section on a failed refresh.
  if (!data) return cached?.events ?? [];

  const events: LiveEvent[] = [];
  for (const e of data._embedded?.events ?? []) {
    const start = e.dates?.start;
    if (!e.id || !start?.localDate) continue;
    if (e.dates?.status?.code === "cancelled") continue;

    const venue = e._embedded?.venues?.[0];
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
    });
  }

  const unique = dedupe(events);
  eventsCache.set(spotifyArtistId, {
    events: unique,
    expiresAt: Date.now() + (unique.length ? EVENTS_TTL_MS : EVENTS_EMPTY_TTL_MS),
  });
  return unique;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let artistId = "";
  let name = "";

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    artistId = String(body?.artistId ?? "");
    name = String(body?.name ?? "");
  } else {
    const url = new URL(req.url);
    artistId = url.searchParams.get("artistId") ?? "";
    name = url.searchParams.get("name") ?? "";
  }
  name = name.slice(0, 120);

  // Validate before interpolating anything into an outbound URL.
  if (!SPOTIFY_ID.test(artistId)) return json({ error: "missing_artist_id" }, 400);
  if (!name.trim()) return json({ error: "missing_name" }, 400);

  // `configured: false` means "no key here" — the client hides the section
  // rather than claiming the artist has no shows, which is a different thing.
  if (!Deno.env.get("TICKETMASTER_API_KEY")) return json({ events: [], configured: false });

  const events = await getArtistEvents(artistId, name);
  return json({ events: events.slice(0, 40), configured: true });
});
