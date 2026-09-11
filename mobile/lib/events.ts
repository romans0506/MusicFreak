import { supabase } from "@/lib/supabase";

// Upcoming live dates via the `artist-events` Supabase Edge Function
// (supabase/functions/artist-events/index.ts). The Ticketmaster key can't ship
// in the bundle, so the function holds it and `functions.invoke` sends the
// session we already have.

export type LiveEvent = {
  id: string;
  name: string;
  /** Ticketmaster event page — where the tickets actually are. */
  url: string;
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  /** Local start time "HH:MM:SS", or null when it's still TBA. */
  time: string | null;
  venue: string | null;
  city: string | null;
  /** ISO alpha-2, for `flagUrl()`. */
  country: string | null;
  image: string | null;
};

/**
 * `ok` is false when the call itself failed — the function isn't deployed yet,
 * the phone is offline, or the key is missing. The screen hides the section in
 * that case rather than rendering "no shows", which is a different claim.
 */
export type EventsResult = { ok: boolean; events: LiveEvent[] };

// The function caches for 6h server-side; this only avoids a round trip when
// you bounce between artist screens in one session.
const cache = new Map<string, { events: LiveEvent[]; expiresAt: number }>();
const TTL_MS = 15 * 60_000;

/** `force` skips the local cache — pull-to-refresh passes it. */
export async function getArtistEvents(
  artistId: string,
  name: string,
  { force = false }: { force?: boolean } = {},
): Promise<EventsResult> {
  if (!artistId || !name.trim()) return { ok: true, events: [] };

  const cached = cache.get(artistId);
  if (!force && cached && cached.expiresAt > Date.now()) return { ok: true, events: cached.events };

  try {
    const { data, error } = await supabase.functions.invoke("artist-events", {
      body: { artistId, name },
    });
    // A missing deployment lands here too; degrade to "hide the section".
    if (error) return { ok: false, events: cached?.events ?? [] };
    if (data?.configured === false) return { ok: false, events: [] };

    const events = (data?.events ?? []) as LiveEvent[];
    cache.set(artistId, { events, expiresAt: Date.now() + TTL_MS });
    return { ok: true, events };
  } catch {
    return { ok: false, events: cached?.events ?? [] };
  }
}
