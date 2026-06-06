"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Music2, Trophy, RotateCcw, Search, Clock, ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"

type PickArtist = { id: string; name: string; image: string | null }
type Option = { name: string; albumArt: string | null }
type Round = { id: string; previewUrl: string; options: Option[]; correctIndex: number }
type Leader = { user_id: string; username: string | null; avatar_url: string | null; points: number }
type GameState = "pick" | "loading" | "round" | "reveal" | "end" | "error"

const WINDOW = 12
const MAX_POINTS = 150
const CLIP_MS = 5000

function calcPoints(timeLeft: number) {
  return Math.round(MAX_POINTS * (timeLeft / WINDOW))
}

/** Animated "now playing" bars (no replay — you hear the clip once). */
function Equalizer({ active }: { active: boolean }) {
  return (
    <div className="flex h-5 items-end gap-1">
      {[0, 1, 2, 3].map((i) => (
        <motion.span
          key={i}
          className="w-1 rounded-full bg-primary"
          style={{ height: "30%" }}
          animate={active ? { height: ["30%", "100%", "45%", "85%", "30%"] } : { height: "30%" }}
          transition={active ? { duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: i * 0.12 } : { duration: 0.2 }}
        />
      ))}
    </div>
  )
}

export default function NameSongGame({ userId }: { userId: string }) {
  const [state, setState] = useState<GameState>("pick")
  const [artist, setArtist] = useState<PickArtist | null>(null)
  const [leaders, setLeaders] = useState<Leader[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [current, setCurrent] = useState(0)
  const [chosen, setChosen] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState(WINDOW)
  const [points, setPoints] = useState(0)
  const [gain, setGain] = useState<{ amount: number; key: number } | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [saving, setSaving] = useState(false)

  // Picker data
  const [topArtists, setTopArtists] = useState<PickArtist[]>([])
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PickArtist[]>([])

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const clipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdown = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load top artists for quick-pick
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

  // Debounced artist search
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

  function clearTimers() {
    if (clipTimer.current) clearTimeout(clipTimer.current)
    if (countdown.current) clearInterval(countdown.current)
  }

  function stopAudio() {
    if (clipTimer.current) clearTimeout(clipTimer.current)
    const a = audioRef.current
    if (a) {
      a.pause()
    }
  }

  const playClip = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    if (clipTimer.current) clearTimeout(clipTimer.current)
    a.currentTime = 0
    // Start the 5s window only once playback actually begins, so the clip
    // isn't cut short (or skipped) while the audio is still buffering.
    const armStop = () => {
      if (clipTimer.current) clearTimeout(clipTimer.current)
      clipTimer.current = setTimeout(() => a.pause(), CLIP_MS)
    }
    const p = a.play()
    if (p && typeof p.then === "function") {
      p.then(armStop).catch(() => {})
    } else {
      armStop()
    }
  }, [])

  const goToReveal = useCallback(
    (chosenIndex: number | null, remaining: number) => {
      clearTimers()
      stopAudio()
      const round = rounds[current]
      const correct = chosenIndex === round.correctIndex
      const pts = correct ? calcPoints(remaining) : 0
      setChosen(chosenIndex)
      if (correct) {
        setPoints((p) => p + pts)
        setCorrectCount((c) => c + 1)
        setGain({ amount: pts, key: Date.now() })
      }
      setState("reveal")

      setTimeout(() => {
        if (current + 1 >= rounds.length) {
          setState("end")
        } else {
          setGain(null)
          setCurrent((c) => c + 1)
          setChosen(null)
          setTimeLeft(WINDOW)
          setState("round")
        }
      }, 1800)
    },
    [current, rounds]
  )

  // Drive each round: load audio, play 5s clip, run countdown.
  useEffect(() => {
    if (state !== "round") return
    const round = rounds[current]
    if (!round) return

    const a = audioRef.current
    if (a) {
      a.src = round.previewUrl
      a.load()
    }
    playClip()

    countdown.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          goToReveal(null, 0)
          return 0
        }
        return t - 1
      })
    }, 1000)

    return clearTimers
  }, [state, current, rounds, playClip, goToReveal])

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      clearTimers()
      audioRef.current?.pause()
    }
  }, [])

  async function startGame(a: PickArtist) {
    setArtist(a)
    setState("loading")
    setCurrent(0)
    setChosen(null)
    setTimeLeft(WINDOW)
    setPoints(0)
    setGain(null)
    setCorrectCount(0)
    try {
      const res = await fetch(`/api/games/name-song/generate?artistId=${a.id}&artistName=${encodeURIComponent(a.name)}`)
      const data = await res.json()
      if (!res.ok || !data.rounds?.length) {
        setState("error")
        return
      }
      setRounds(data.rounds)
      setState("round")
    } catch {
      setState("error")
    }
  }

  const saveScore = useCallback(async () => {
    if (saving) return
    setSaving(true)
    await fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game_type: "guess-second",
        points,
        artist_id: artist?.id,
        artist_name: artist?.name,
        artist_image: artist?.image,
      }),
    })
    setSaving(false)
  }, [saving, points, artist])

  // On game end: persist the score, then load this artist's leaderboard.
  useEffect(() => {
    if (state !== "end") return
    let cancelled = false
    ;(async () => {
      await saveScore()
      if (!artist || cancelled) return
      try {
        const res = await fetch(`/api/games/name-song/leaderboard?artistId=${artist.id}`)
        const data = await res.json()
        if (!cancelled) setLeaders(data.leaders ?? [])
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // Shared hidden audio element
  const audioEl = <audio ref={audioRef} preload="auto" />

  if (state === "pick") {
    const list = query.trim().length >= 2 ? results : topArtists
    return (
      <div className="mx-auto max-w-2xl">
        {audioEl}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-3xl bg-primary/15">
            <Music2 className="size-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Name That Song</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pick an artist — guess their songs from a 5-second clip</p>
        </div>

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
              onClick={() => startGame(a)}
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

  if (state === "loading") {
    return (
      <div className="flex flex-col items-center gap-4 py-24">
        {audioEl}
        <div className="size-10 animate-spin rounded-full border-4 border-border border-t-primary" />
        <p className="text-muted-foreground">Preparing clips…</p>
      </div>
    )
  }

  if (state === "error") {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        {audioEl}
        <Music2 className="size-10 text-muted-foreground/40" />
        <p className="font-medium">Couldn&apos;t build a round for {artist?.name}</p>
        <p className="text-sm text-muted-foreground">We couldn&apos;t find enough playable previews. Try another artist.</p>
        <button onClick={() => setState("pick")} className="mt-2 text-sm text-primary hover:underline">Pick another artist</button>
      </div>
    )
  }

  if (state === "end") {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-8 py-12 text-center">
        {audioEl}
        {artist?.image ? (
          <img
            src={artist.image}
            alt={artist.name}
            className="size-28 rounded-full object-cover shadow-lg ring-4 ring-primary/20"
          />
        ) : (
          <div className="flex size-28 items-center justify-center rounded-full bg-muted text-4xl font-bold text-muted-foreground">
            {artist?.name?.[0]?.toUpperCase()}
          </div>
        )}
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Final Score</p>
          <p className="mt-1 text-6xl font-bold text-primary">{points}</p>
          <p className="mt-2 text-muted-foreground">{correctCount}/{rounds.length} correct · {artist?.name}</p>
        </div>

        {/* Per-artist leaderboard */}
        {leaders.length > 0 && (
          <div className="w-full max-w-md text-left">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Trophy className="size-4 text-primary" />
              Top players · {artist?.name}
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {leaders.slice(0, 10).map((l, i) => {
                const isMe = l.user_id === userId
                const name = l.username ?? "Anonymous"
                return (
                  <div
                    key={l.user_id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5",
                      i < Math.min(leaders.length, 10) - 1 && "border-b border-border",
                      isMe && "bg-primary/10"
                    )}
                  >
                    <span className={cn("w-5 shrink-0 text-sm font-semibold tabular-nums", i === 0 ? "text-primary" : "text-muted-foreground")}>
                      {i + 1}
                    </span>
                    {l.avatar_url ? (
                      <img src={l.avatar_url} alt={name} className="size-7 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {name[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {name}
                      {isMe && <span className="ml-1 text-xs text-primary">(you)</span>}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">{l.points}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={() => artist && startGame(artist)} className="flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80">
            <RotateCcw className="size-4" /> Play Again
          </button>
          <button onClick={() => setState("pick")} className="flex items-center gap-2 rounded-full border border-border bg-card px-6 py-2.5 text-sm font-medium transition-colors hover:bg-muted/40">
            <ArrowLeft className="size-4" /> New Artist
          </button>
        </div>
      </motion.div>
    )
  }

  const round = rounds[current]
  if (!round) return null

  return (
    <div className="mx-auto max-w-xl">
      {audioEl}
      {/* HUD */}
      <div className="mb-6 flex items-center gap-4">
        <span className="shrink-0 text-sm text-muted-foreground">{current + 1} / {rounds.length}</span>
        <div className="flex-1 overflow-hidden rounded-full bg-muted h-1.5">
          <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${(current / rounds.length) * 100}%` }} transition={{ duration: 0.3 }} />
        </div>
        {/* Score with pop + floating gain */}
        <div className="relative shrink-0">
          <motion.span
            key={points}
            initial={{ scale: 1.4 }}
            animate={{ scale: 1 }}
            className="text-sm font-semibold tabular-nums text-primary"
          >
            {points} pts
          </motion.span>
          <AnimatePresence>
            {gain && gain.amount > 0 && (
              <motion.span
                key={gain.key}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: [0, 1, 0], y: -22 }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                className="pointer-events-none absolute -top-1 right-0 text-sm font-bold text-green-400"
              >
                +{gain.amount}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className={cn("flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums", timeLeft <= 4 ? "text-red-400 animate-pulse" : "text-muted-foreground")}>
          <Clock className="size-3.5" />
          {timeLeft}s
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={round.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
          {/* Artist photo with countdown ring */}
          <div className="mb-6 flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center">
            <div className="relative size-40">
              {/* Depleting time ring */}
              <svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="46" fill="none" strokeWidth="4" className="stroke-muted" />
                <motion.circle
                  key={round.id}
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  strokeWidth="4"
                  strokeLinecap="round"
                  className={cn(timeLeft <= 4 ? "stroke-red-500" : "stroke-primary")}
                  initial={{ pathLength: 1 }}
                  animate={{ pathLength: state === "round" ? 0 : undefined }}
                  transition={{ duration: WINDOW, ease: "linear" }}
                />
              </svg>
              {/* Photo */}
              <div className="absolute inset-[10px]">
                {artist?.image ? (
                  <img src={artist.image} alt={artist.name} className="size-full rounded-full object-cover shadow-lg" />
                ) : (
                  <div className="flex size-full items-center justify-center rounded-full bg-muted text-4xl font-bold text-muted-foreground">
                    {artist?.name?.[0]?.toUpperCase()}
                  </div>
                )}
              </div>
            </div>
            <p className="text-base font-semibold">{artist?.name}</p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Equalizer active={state === "round"} />
              <span>Now playing…</span>
            </div>
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {round.options.map((option, i) => {
              const isChosen = chosen === i
              const isCorrect = i === round.correctIndex
              const isAnswered = state === "reveal"

              let style = "border-border bg-card hover:border-primary/40 hover:bg-muted/40"
              if (isAnswered) {
                if (isCorrect) style = "border-green-500 bg-green-500/10 text-green-400"
                else if (isChosen) style = "border-red-500 bg-red-500/10 text-red-400"
                else style = "border-border bg-card opacity-40"
              }

              return (
                <motion.button
                  key={i}
                  whileHover={!isAnswered ? { scale: 1.02 } : {}}
                  whileTap={!isAnswered ? { scale: 0.98 } : {}}
                  disabled={isAnswered}
                  onClick={() => goToReveal(i, timeLeft)}
                  className={cn("flex items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm font-medium transition-all", style)}
                >
                  {option.albumArt ? (
                    <img src={option.albumArt} alt="" className="size-11 shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Music2 className="size-4 text-muted-foreground/40" />
                    </div>
                  )}
                  <span className="min-w-0 flex-1 truncate">{option.name}</span>
                </motion.button>
              )
            })}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
