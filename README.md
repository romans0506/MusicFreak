# MusicFreak

A music game and listening-stats app built on your Spotify account. It ships as a **Next.js web app** and an **Expo (React Native) mobile app** that share one Supabase backend.

You sign in with Spotify. From then on MusicFreak records what you listen to, turns it into stats Spotify doesn't show you (play counts, streaks, minutes listened, peak hours), and has music games with global and per-artist leaderboards.

> **Status:** finished. I no longer work on it. There's no public demo, because Spotify caps apps in development mode at 5 allowlisted users.

---

## Features

**Games**
- **Name That Song:** pick any artist, hear a 5-second clip, then guess the track. Each artist has its own leaderboard.
- **Music Quiz:** 10 hard trivia questions drawn from a hand-written bank of 100+ questions about the world's biggest artists, each shown with the artist's photo.
- **Lyric → Song:** name the song from a line of its lyrics. You can play with your own top 50 tracks or with any artist's catalogue.
- **Higher or Lower:** guess which artist has more followers. Built, but switched off (see *Challenges*).

**Listening stats**
- Your own play history, collected in the background from Spotify's "recently played" feed.
- Plays and minutes listened for today, this week, this month and all time. Also: top tracks, artists and albums, an hour-of-day histogram, a genre breakdown and listening streaks.
- Badges such as *Century*, *Night Owl*, *Dedicated* (a 7-day streak) and *Explorer*.
- A **"Wrapped"-style share image** (1080×1920 PNG) drawn on the server from your own data.

**Social and discovery**
- **Listening Map:** a world map where each country is filled with the photo of its #1 artist by minutes listened across all users. Click a country to see its top artists and top listeners.
- Artist pages with discography, your top tracks by that artist, fans on MusicFreak, and **live tour dates** from Ticketmaster.
- Profiles with a custom avatar, banner (GIFs work), bio, favourite artists and songs, and an activity feed.
- A global leaderboard and a daily featured song.

---

## Tech stack

| | |
|---|---|
| **Web** | Next.js 16 (App Router, Server Components, Route Handlers), React 19, TypeScript, Tailwind CSS v4, Base UI / shadcn, Framer Motion |
| **Mobile** | Expo SDK 57, expo-router, React Native 0.86 (New Architecture), Reanimated 4, Gesture Handler, expo-audio, react-native-svg |
| **Backend** | Supabase: Postgres with Row-Level Security, Auth (Spotify OAuth), Storage, SQL RPCs, Deno Edge Functions |
| **Maps / viz** | d3-geo (Equal Earth projection), topojson-client, `next/og` for image generation |
| **External APIs** | Spotify Web API, iTunes Search API (audio previews and catalogue), lrclib.net (lyrics), Ticketmaster Discovery API |

---

## Architecture

```
┌──────────────────────┐        ┌──────────────────────┐
│  Next.js web app     │        │  Expo mobile app     │
│  Server Components   │        │  talks to Supabase   │
│  + /api route        │        │  directly (RLS)      │
│    handlers (proxy)  │        │                      │
└─────────┬────────────┘        └──────┬───────────────┘
          │                            │
          │        ┌───────────────────┴──────┐
          │        │ Supabase Edge Functions  │  hold the secrets
          │        │ artist-events, spotify-  │  a phone can't
          │        │ search (Deno)            │
          │        └───────────┬──────────────┘
          ▼                    ▼
┌──────────────────────────────────────────────┐
│ Supabase: Postgres + RLS · Auth · Storage    │
│ play_history, scores, profiles, favourites   │
│ aggregation RPCs (invoker + definer)         │
└──────────────────────────────────────────────┘
          │
          ▼
Spotify · iTunes · lrclib · Ticketmaster
```

- **Web:** Server Components fetch data and pass typed props to client components. The browser never calls Spotify. Everything goes through our own route handlers, which pick the right token on the server.
- **Mobile:** there's no API layer. The device reads and writes Supabase directly, and Row-Level Security limits each user to their own rows. The two things that need a secret (the Spotify client secret and the Ticketmaster key) run in **Supabase Edge Functions**, because anything Expo builds into the app bundle is public.
- **Shared data:** both platforms write listening history to one `play_history` table. Both use the same deduplication key, `(user_id, played_at)`, so a play recorded from both devices is counted once.

---

## Challenges

Most of the interesting work was getting around platform limits.

**Spotify has no play counts, so I built my own.** The only personal listening data Spotify gives you is the last ~50 plays. A background "scrobbler" on each platform polls that feed with an `after=` cursor and inserts rows idempotently into Postgres. All the stats come from SQL aggregation over that table: per-track and per-artist counts, minutes listened, day and hour histograms, and streaks.

**Rate limits that also break login.** Spotify rate limits by app, not by user. A 429 on the app's `client_id` also blocks OAuth login, because Supabase fetches the Spotify profile during sign-in with the same credentials. In development mode a 429 can last **hours** (`QUOTA_EXCEEDED`). What I built to avoid it:
- Tokens are cached until they expire. Concurrent requests for a token share one in-flight promise instead of each asking Spotify.
- After a 429, a global cool-down (which respects `Retry-After`) stops every Spotify call. Routes return an empty result during the cool-down instead of an error.
- Per-user response caches (25s to 5min) and an IP-based fixed-window limiter sit in front of every Spotify-backed route.
- The lyrics fetcher uses a small worker pool (at most 5 at a time) that stops early once it has enough. lrclib throttled large parallel batches.

**Spotify tokens on a phone that stay valid.** Supabase keeps Spotify's access token only right after sign-in. Renewing it requires the client secret, which can't be shipped in an app. On mobile, sign-in also runs a second **Authorization Code with PKCE** flow, and the resulting refresh token is kept in SecureStore. The app renews its own tokens from then on, so Spotify features no longer stop working an hour after login. The two flows use the same scopes, so the second one skips Spotify's consent screen and adds no extra tap.

**Deprecated and restricted endpoints.** Spotify removed or restricted many catalogue endpoints in late 2024 (artist top tracks, the batch artist lookup, audio previews, and larger search result limits). I worked around each one:
- An artist's top tracks come from your own top tracks across three time ranges, filtered by artist.
- Audio clips and artist catalogues come from the iTunes Search API. The clip then always matches the song title, and you get the artist's full catalogue.
- Higher or Lower is paused. Its artist pool needs ~200 single-artist requests, and those kept hitting the quota.

**Matching concert data to the right artist.** A name search on Ticketmaster often ranks tribute bands above the real artist. I match on the Spotify ID stored in Ticketmaster's external links instead. Duplicate listings for one show (presale, main page, multi-night packages) are merged by date and venue.

**Security.** Every table has RLS. Queries across users (leaderboards, the map) go through a few narrow `security definer` functions. One bug worth noting: `favorite_*` tables are readable by everyone, so RLS doesn't limit them to the current user. A missing `.eq("user_id", …)` once gave users a badge for favourites they didn't have.

---

## Project structure

```
src/                    Next.js web app
  app/                  routes: landing, /app/*, /profile, /api/*
  components/           UI (games, stats, map, profile)
  lib/                  spotify.ts, rate-limit.ts, stats.ts, itunes.ts, ticketmaster.ts
mobile/                 Expo app (separate npm project)
  app/                  expo-router screens (tabs, games, artist)
  lib/                  auth, PKCE Spotify auth, scrobbler, game generators
supabase/functions/     Deno edge functions: artist-events, spotify-search
public/world-110m.json  world topology for the map
```

---

## Running it locally

You'll need a Supabase project, a Spotify developer app, and (optionally) a Ticketmaster API key.

> The database schema (tables, RLS policies and RPCs) was applied by hand in the Supabase SQL editor and **isn't in this repo**. The tables are listed in [`CLAUDE.md`](CLAUDE.md#supabase), but you'd have to recreate the SQL yourself.

**Web**

```bash
npm install
npm run dev
```

`.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
TICKETMASTER_API_KEY=        # optional; hides Live Dates when missing
```

In Supabase, turn on the Spotify provider under Auth → Providers, using the same client ID and secret.

**Mobile** (run every Expo command from `mobile/`, never from the repo root)

```bash
cd mobile
npm install
npm start
```

`mobile/.env.local`:

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_SPOTIFY_CLIENT_ID=
EXPO_PUBLIC_AUTH_BRIDGE=     # https origin hosting mobile/auth-bridge/native-auth.html
```

**Edge functions**

```bash
npx supabase functions deploy artist-events --project-ref <ref>
npx supabase functions deploy spotify-search --project-ref <ref>
npx supabase secrets set TICKETMASTER_API_KEY=... SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=...
```

Detailed engineering notes (gotchas, design decisions, what failed and why) are in [`CLAUDE.md`](CLAUDE.md) and [`mobile/CLAUDE.md`](mobile/CLAUDE.md).

---

*Not affiliated with Spotify. Data and artwork belong to their respective owners.*
