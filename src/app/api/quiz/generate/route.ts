import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, callerKey } from "@/lib/rate-limit"
import { getArtistImage } from "@/lib/spotify"
import { MUSIC_TRIVIA, photoArtistFor } from "@/lib/music-trivia"

// Music Quiz: hard trivia about the world's biggest artists (the artists, their
// songs, albums and personal lives). Questions come from a curated static bank
// (src/lib/music-trivia.ts) — no Spotify needed, so it's fast and works even
// for users with no listening history.

export type Question = {
  id: string
  question: string
  image: string | null
  options: string[]
  correctIndex: number
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}

export async function GET(req: Request) {
  const limit = rateLimit(`quiz:${callerKey(req)}`, 10, 30_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    )
  }

  // Require a session (consistent with other game routes / abuse protection).
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: "no_token" }, { status: 401 })

  const selected = shuffle(MUSIC_TRIVIA).slice(0, 10)

  // Resolve artist photos for this round. Bounded concurrency (3) keeps us gentle
  // on Spotify; getArtistImage caches hard so this is usually all cache hits.
  const names = [...new Set(selected.map((q) => photoArtistFor(q.id)).filter((n): n is string => !!n))]
  const images = new Map<string, string | null>()
  let next = 0
  async function worker() {
    while (next < names.length) {
      const name = names[next++]
      images.set(name, await getArtistImage(name))
    }
  }
  await Promise.all([worker(), worker(), worker()])

  const questions: Question[] = selected.map((q) => {
    // options[0] is the authored correct answer; shuffle so its position varies.
    const correct = q.options[0]
    const options = shuffle(q.options)
    const artist = photoArtistFor(q.id)
    return {
      id: q.id,
      question: q.question,
      image: artist ? images.get(artist) ?? null : null,
      options,
      correctIndex: options.indexOf(correct),
    }
  })

  return NextResponse.json({ questions })
}
