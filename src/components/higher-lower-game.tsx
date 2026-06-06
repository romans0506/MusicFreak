"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Scale, Trophy, RotateCcw, ChevronRight, Flame, Users, Heart } from "lucide-react"
import { cn } from "@/lib/utils"

type Artist = { id: string; name: string; image: string | null; followers: number }
type Pair = { a: Artist; b: Artist }
type GameState = "start" | "loading" | "error" | "playing" | "reveal" | "end"

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function makePair(pool: Artist[]): Pair | null {
  for (let t = 0; t < 200; t++) {
    const a = pool[Math.floor(Math.random() * pool.length)]
    const b = pool[Math.floor(Math.random() * pool.length)]
    if (a.id !== b.id && a.followers !== b.followers) return { a, b }
  }
  return null
}

export default function HigherLowerGame() {
  const [state, setState] = useState<GameState>("start")
  const [pool, setPool] = useState<Artist[]>([])
  const [pair, setPair] = useState<Pair | null>(null)
  const [chosen, setChosen] = useState<"a" | "b" | null>(null)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function startGame() {
    setState("loading")
    setScore(0)
    setChosen(null)
    setErrorMsg(null)
    try {
      const res = await fetch("/api/games/higher-lower/generate")
      const data = await res.json()
      if (!res.ok || !data.artists?.length) {
        setErrorMsg(`HTTP ${res.status}`)
        setState("error")
        return
      }
      setPool(data.artists)
      setPair(makePair(data.artists))
      setState("playing")
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "network error")
      setState("error")
    }
  }

  function choose(side: "a" | "b") {
    if (state !== "playing" || !pair) return
    const correctSide = pair.a.followers >= pair.b.followers ? "a" : "b"
    const isCorrect = side === correctSide
    setChosen(side)
    setState("reveal")

    if (isCorrect) {
      const next = score + 1
      setScore(next)
      setBest((b) => Math.max(b, next))
      setTimeout(() => {
        setPair(makePair(pool))
        setChosen(null)
        setState("playing")
      }, 1300)
    } else {
      // One mistake ends the run.
      setTimeout(() => setState("end"), 1800)
    }
  }

  const saveScore = useCallback(async () => {
    if (saving || score === 0) return
    setSaving(true)
    await fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_type: "higher-lower", points: score * 100 }),
    })
    setSaving(false)
  }, [saving, score])

  useEffect(() => {
    if (state === "end") saveScore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  if (state === "start") {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-8 py-12 text-center">
        <div className="flex size-20 items-center justify-center rounded-3xl bg-violet-500/15">
          <Scale className="size-10 text-violet-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Higher or Lower</h1>
          <p className="mt-2 text-muted-foreground">Which artist has more followers?</p>
        </div>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>🌍 World-famous artists</p>
          <p>♾️ Keep going until your first mistake</p>
          <p>🔥 How long is your streak?</p>
        </div>
        <button onClick={startGame} className="flex items-center gap-2 rounded-full bg-primary px-8 py-3 text-base font-semibold text-primary-foreground transition-all hover:bg-primary/80 hover:scale-105">
          Start <ChevronRight className="size-5" />
        </button>
      </motion.div>
    )
  }

  if (state === "loading") {
    return (
      <div className="flex flex-col items-center gap-4 py-24">
        <div className="size-10 animate-spin rounded-full border-4 border-border border-t-primary" />
        <p className="text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (state === "error") {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <Scale className="size-10 text-muted-foreground/40" />
        <p className="font-medium">Couldn&apos;t start this game</p>
        <p className="text-sm text-muted-foreground">Please try again in a moment.</p>
        {errorMsg && <p className="text-xs text-muted-foreground/60">({errorMsg})</p>}
        <button onClick={() => setState("start")} className="mt-2 text-sm text-primary hover:underline">Try again</button>
      </div>
    )
  }

  if (state === "end") {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-8 py-12 text-center">
        <div className="flex size-20 items-center justify-center rounded-3xl bg-primary/15">
          <Trophy className="size-10 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Streak</p>
          <p className="mt-1 text-6xl font-bold text-primary">{score}</p>
          <p className="mt-2 text-muted-foreground">correct in a row · {score * 100} pts</p>
        </div>
        <button onClick={startGame} className="flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80">
          <RotateCcw className="size-4" /> Play Again
        </button>
      </motion.div>
    )
  }

  if (!pair) return null
  const correctSide: "a" | "b" = pair.a.followers >= pair.b.followers ? "a" : "b"
  const revealing = state === "reveal"

  const Card = ({ side, artist }: { side: "a" | "b"; artist: Artist }) => {
    const isChosen = chosen === side
    const isCorrect = side === correctSide
    return (
      <motion.button
        whileHover={!revealing ? { scale: 1.02 } : {}}
        whileTap={!revealing ? { scale: 0.98 } : {}}
        disabled={revealing}
        onClick={() => choose(side)}
        className={cn(
          "group relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border p-6 text-center transition-colors",
          revealing
            ? isCorrect
              ? "border-green-500 bg-green-500/10"
              : isChosen
                ? "border-red-500 bg-red-500/10"
                : "border-border opacity-50"
            : "border-border bg-card hover:border-primary/40"
        )}
      >
        {artist.image ? (
          <img src={artist.image} alt={artist.name} className="size-28 rounded-full object-cover shadow-lg" />
        ) : (
          <div className="flex size-28 items-center justify-center rounded-full bg-muted text-3xl font-bold text-muted-foreground">
            {artist.name[0]?.toUpperCase()}
          </div>
        )}
        <p className="text-lg font-semibold leading-tight">{artist.name}</p>
        <div className="h-7">
          <AnimatePresence>
            {revealing && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Users className="size-3.5 text-muted-foreground" />
                {formatFollowers(artist.followers)} followers
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.button>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* HUD */}
      <div className="mb-6 flex items-center justify-between">
        <span className="flex items-center gap-1 text-sm font-semibold text-primary">
          <Flame className="size-4" /> Streak {score}
        </span>
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          <Heart className="size-4 text-red-400" /> 1 life
        </span>
      </div>

      <p className="mb-6 text-center text-lg font-semibold">Who has more followers?</p>

      <div className="flex items-stretch gap-3 sm:gap-5">
        <Card side="a" artist={pair.a} />
        <div className="flex items-center justify-center">
          <span className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-xs font-bold text-muted-foreground">VS</span>
        </div>
        <Card side="b" artist={pair.b} />
      </div>
    </div>
  )
}
