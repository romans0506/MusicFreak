# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # dev server (Turbopack by default in Next.js 16)
npm run build    # production build (Turbopack by default)
npm run start    # production server
npm run lint     # ESLint directly (next lint was removed in v16)
npx tsc --noEmit # typecheck without emitting (use this to verify changes)
```

There is no test suite yet. Verify changes with `npx tsc --noEmit`.

## Architecture

**Next.js 16 App Router** project. All routes live under `src/app/`. Path alias `@/` maps to `src/`.

**Route layout:**
- `/` — public landing/onboarding. Server-redirects authenticated users to `/app`.
- `/app/*` — protected area. `src/app/app/layout.tsx` is the auth gate (`getUser()` → redirect to `/` if absent), renders `AppNav` (tab pills: Games / Leaderboard / Artists / Stats), and mounts the headless `<PlayScrobbler/>` (see Listening history). Tabs: `/app`, `/app/leaderboard`, `/app/artists`, `/app/artists/[id]`, `/app/games/music-quiz`, `/app/stats`.
- `/profile` — protected profile page (note: lives at `/profile`, **not** `/app/profile`).
- `/auth/callback`, `/auth/error` — OAuth handling.
- `/api/wrapped` — `next/og` `ImageResponse` route that renders a Spotify-Wrapped-style PNG (1080×1920) from the user's own `play_history`. `ImageResponse` only supports flexbox + a CSS subset (no grid), and no oklch — use hex.

**Data flow pattern:** Server Components (`page.tsx`) fetch from Supabase + Spotify and pass typed props down to Client Components (animation, interactivity). Client Components are marked `"use client"` and use Framer Motion.

**Auth:** Supabase Auth with Spotify OAuth. `nextauth` is in `package.json` but **not used** — all auth goes through `@supabase/ssr`. Flow: `SignInButton` → Supabase OAuth → Spotify → `https://<project>.supabase.co/auth/v1/callback` → `src/app/auth/callback/route.ts` → session set → redirect (authenticated users land on `/app`).

**Hydration:** Auth-dependent UI uses a `mounted` flag (`useState(false)`, set in `useEffect`) to avoid SSR/client mismatch. Never render auth state during SSR. `<body>` has `suppressHydrationWarning` (browser extensions like Grammarly inject attributes).

## Spotify integration

This is the most error-prone area. Spotify deprecated many catalog endpoints (Nov 2024). Two token types, used for different things — **do not mix them up:**

| Token | Source | Use for |
|---|---|---|
| **User token** | `resolveSpotifyUserToken(session)` in `src/lib/spotify.ts` | personal data — `/v1/me/...` only (top tracks/artists, now-playing, recently-played). |
| **App token** (Client Credentials) | `getSpotifyAppToken()` in `src/lib/spotify.ts` | catalog — `/v1/search`, `/v1/artists/{id}/albums`, `/v1/artists?ids=`. |

**Never read `session.provider_token` directly.** It expires after ~1h and is dropped on Supabase session refresh (this was the cause of recurring 401s/login failures). Always go through `resolveSpotifyUserToken(session)`, which mints a fresh user token from `session.provider_refresh_token` (cached until expiry) and falls back to `provider_token`. Token minting is **de-duplicated by an in-flight promise** (both user-refresh and app-token paths) — concurrent callers share one request, since racing `/api/token` calls themselves trigger 429s.

**Endpoint reality:**
- `/v1/me/...` with the user token is the only reliable source of personal listening data.
- `GET /v1/artists/{id}/top-tracks` is **deprecated** (403). Artist "top tracks" are instead derived by fetching `/v1/me/top/tracks` across `short_term`/`medium_term`/`long_term` and filtering by `artistId`.
- Catalog endpoints (search, albums) **require the app token** — they 400/403 with a user token.
- `preview_url` is now `null` on most tracks. UI must fall back (e.g. open the track on Spotify) rather than assume a 30s preview exists.

**Proxy-route pattern:** Client Components never call Spotify directly — the browser's `provider_token` becomes unreliable after a Supabase session refresh. Instead they call our own route handlers under `src/app/api/spotify/*`, which resolve the token server-side. User-token routes: `artist-tracks`, `top-stats`, `currently-playing`, `recently-played`, `ingest-plays`. App-token routes: `search`, `artist-discography` (with a user-history fallback). All user-token fetches go through `spotifyUserFetch()` (`src/lib/spotify.ts`), which honours the global cool-down and feeds a 429 back into it — a 429 on a `/v1/me/...` call shares the `client_id` and can break login just like an app-token 429, so user-token routes must trip the cool-down too (they previously swallowed 429s silently).

**Env vars** (`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`.

> **Critical gotcha:** The Spotify Client Secret lives in **two** places — `.env.local` (app token) **and** Supabase Dashboard → Auth → Providers → Spotify (login). Rotating the secret in the Spotify Dashboard breaks login until the Supabase copy is updated to match. Keep them in sync.

## Rate limiting & Spotify 429s

Requesting a fresh app token per call once flooded Spotify and triggered a `429` on the whole `client_id` — which **also breaks OAuth login** (Supabase's profile fetch shares the `client_id`). Mitigations now in place:

- `src/lib/spotify.ts` caches both token types until expiry (de-duped via in-flight promises), and on a Spotify `429` sets a global cool-down (`spotifyCooldown()` / `noteSpotify429()`, respects `Retry-After`) during which it stops hitting Spotify entirely. Every route checks the cool-down and returns a graceful empty/`rateLimited` payload while it's active.
- `src/lib/rate-limit.ts` — in-memory fixed-window limiter keyed by IP (`callerKey`). Applied to every `src/app/api/spotify/*` route and `api/quiz/generate`; returns `429` + `Retry-After`.
- Per-user response caches sit in front of the user-token routes: `currently-playing` (25s), `top-stats` (5min), `recently-played` (60s), and `search` (60s). These do the real work of keeping Spotify load down — the self-limiter is just abuse protection, so its thresholds can be loose.

All of this state is **in-memory** — fine for dev/single instance, but resets on serverless cold starts and is not shared across instances. For real production, back the token cache, cool-down, and limiter with Redis/Upstash (same API surface).

## Listening history & stats

Spotify exposes **no play counts**, so we accumulate our own from `/v1/me/player/recently-played` (which returns the last ~50 plays with `played_at`, but only counts plays longer than ~30s — there is **no** way to know how much of a track was actually heard, so an exact "listened ≥70%" rule is impossible).

Flow: `<PlayScrobbler/>` (headless client component in the app layout, fires once per app session) → `POST /api/spotify/ingest-plays` → fetches recently-played with an `after=<lastStoredMs>` cursor → upserts into `play_history` with `onConflict: "user_id,played_at", ignoreDuplicates: true`. The ingest route self-throttles per user (30s) so reloads don't re-poll Spotify.

Consumers of the aggregation RPCs: `/app/stats` (`StatsView` — streaks/badges from `src/lib/stats.ts`, hour histogram, genre breakdown), the profile "Your Most Played" section, and `/api/wrapped`. Streak/badge math lives in `src/lib/stats.ts` as pure functions (`computeStreak`, `computeBadges`) — keep it there, not in components.

## Supabase

Two clients — never mix them up:

- `src/lib/supabase/client.ts` — `createBrowserClient` for Client Components / browser route handlers.
- `src/lib/supabase/server.ts` — `createServerClient` (async, reads `cookies()`) for Server Components, Server Actions, server route handlers.

**Database schema:**

| Table / View | Purpose |
|---|---|
| `profiles` | Extends `auth.users`, auto-created on signup via trigger. Customization columns: `username`, `bio`, `custom_avatar_url`, `banner_url`. |
| `scores` | One row per game played. `game_type` ∈ `guess-second`, `guess-clip`, `music-quiz`, `lyric-song`. |
| `daily_content` | One row per date. Queried by today's ISO date string. |
| `favorite_artists` | User's favourite artists (`artist_id`, `artist_name`, `artist_image`). Public-read so the artist page can list "fans". |
| `favorite_songs` | User's favourite songs (`track_id`, `name`, `artists`, `album_art`, `artist_ids text[]`). Public-read. `artist_ids` powers "Loved by MusicFreak" counts on artist pages. |
| `play_history` | One row per Spotify play, accumulated by us (Spotify gives no play counts). Columns: `track_id, name, artists, artist_id, album_id, album_name, album_art, duration_ms, played_at`. `unique (user_id, played_at)` is the dedup key. RLS owner-only. |
| `leaderboard` | View — `profiles` LEFT JOIN `scores`, ordered by `total_points desc`. Exposes `id, username, total_points` (avatars are joined separately from `profiles`). |

**`play_history` aggregation RPCs** (all `security invoker`, so RLS scopes them to `auth.uid()`; all take an optional `p_since timestamptz`): `get_play_counts` (per-track counts), `get_top_artists` (per `artist_id`, with `total_ms` for minutes-listened), `get_top_albums` (per `album_id`), `get_play_days(p_tz)` (distinct days → streaks), `get_play_hours(p_tz)` (hour-of-day histogram). The SQL is **not in the repo** — it's applied manually in the Supabase SQL editor. `get_top_artists`/`get_top_albums`/minutes only reflect plays ingested after the `artist_id`/`album_*`/`duration_ms` columns were added (older rows have them null).

All tables have RLS. Owner-write policies use `auth.uid() = user_id`; `favorite_*` add a `using (true)` SELECT policy for public read.

**Storage:** bucket `profile-media` (public) holds uploaded avatars/banners, including GIFs. Uploads go to `{user_id}/...`; RLS on `storage.objects` restricts writes to your own folder via `(storage.foldername(name))[1]`.

**Avatar precedence:** everywhere an avatar is shown (nav, leaderboard, fans), prefer `custom_avatar_url ?? avatar_url (Spotify) ?? initials`. Custom `username` overrides the Spotify name.

**Session refresh:** `proxy.ts` (repo root) calls `supabase.auth.getUser()` on every request to keep the session cookie fresh — the Next.js 16 replacement for `middleware.ts`.

## UI layer

shadcn style `base-nova` — primitives come from `@base-ui/react/*`, **not** Radix UI. Example: `import { Button as ButtonPrimitive } from "@base-ui/react/button"`. The `asChild` pattern does not exist here; use the `render` prop to compose.

**Styling:** Tailwind CSS v4. Use `@import "tailwindcss"` — the old `@tailwind` directives do not exist. Design tokens are CSS custom properties in `src/app/globals.css` using oklch. Dark by default (`:root` is dark). Primary accent is **dark crimson** `oklch(0.50 0.22 18)` with light `--primary-foreground` (deliberately moved off Spotify green to feel less tied to Spotify).

**Animated links:** use `const MotionLink = motion(Link)` to animate a Next.js `Link` with Framer Motion.

**Background motif:** the red blurred-blob gradient (two `bg-primary` circles with `blur-3xl`) is reused across the landing hero, `/app` layout, and profile for visual consistency.

**Font:** Inter via `next/font/google` with `variable: "--font-sans"`. Body stack is `-apple-system, BlinkMacSystemFont, var(--font-sans), sans-serif` so SF Pro loads natively on Apple devices.

## Next.js 16 breaking changes to keep in mind

**Async Request APIs** — `cookies()`, `headers()`, `params`, `searchParams` are all async. No synchronous fallback.

```tsx
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
}
```

**proxy instead of middleware** — `proxy.ts` at the repo root with an exported `proxy` function.

**Caching APIs** — `cacheLife`/`cacheTag` are stable (no `unstable_` prefix). `revalidateTag` requires a second `cacheLife` profile argument.

**Parallel routes** — every slot requires an explicit `default.js` or builds fail.
