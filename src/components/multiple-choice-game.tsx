"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Trophy, RotateCcw, ChevronRight, Brain, Mic2, Music2, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// Server Components can't pass a component (function) to a Client Component,
// so config carries an icon *key* and we map it here.
const ICONS: Record<string, LucideIcon> = { brain: Brain, mic: Mic2, music: Music2 }

const TOTAL_TIME = 15
const MAX_POINTS_PER_Q = 150

/**
 * Small circular countdown: the seconds-remaining digit inside, a ring around
 * it that depletes each second. Under 5s it turns red and the whole dial
 * blinks. Declared at module level (not inside render) so it keeps its identity.
 */
function CircleTimer({ timeLeft }: { timeLeft: number }) {
  const danger = timeLeft <= 5
  return (
    <div className={cn("relative size-11 shrink-0", danger && "animate-pulse")}>
      <svg className="size-full -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="19" fill="none" strokeWidth="3" className="stroke-muted" />
        <motion.circle
          cx="22"
          cy="22"
          r="19"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className={cn(danger ? "stroke-red-500" : "stroke-primary")}
          animate={{ pathLength: Math.max(timeLeft / TOTAL_TIME, 0) }}
          transition={{ duration: 0.9, ease: "linear" }}
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums",
          danger ? "text-red-400" : "text-foreground"
        )}
      >
        {timeLeft}
      </span>
    </div>
  )
}

export type Question = {
  id: string
  question: string
  /** Optional secondary line under the question (e.g. an artist hint). */
  hint?: string | null
  image: string | null
  options: string[]
  correctIndex: number
}

export type QuizConfig = {
  /** Heading on the start/end screens. */
  title: string
  /** One-line description on the start screen. */
  subtitle: string
  /** scores.game_type value to persist. */
  gameType: string
  /** API route returning { questions: Question[] }. */
  endpoint: string
  /** Tailwind classes for the start-screen icon tile (bg + text color). */
  iconClass: string
  /** Icon key (mapped to a component in ICONS) — a function can't cross the server→client boundary. */
  icon: keyof typeof ICONS
  /** Lines shown in the start-screen rules list. */
  rules?: string[]
  /** Message under the error screen. */
  errorHint?: string
  /** When a question has no image, show a styled "?" tile instead of nothing. */
  imagePlaceholder?: boolean
}

type GameState = "start" | "loading" | "error" | "question" | "answer" | "end"

type AnswerRecord = {
  question: Question
  chosen: number | null
  correct: boolean
  points: number
}

function calcPoints(timeLeft: number) {
  return Math.round(MAX_POINTS_PER_Q * (timeLeft / TOTAL_TIME))
}

export default function MultipleChoiceGame({ config }: { config: QuizConfig }) {
  const Icon = ICONS[config.icon] ?? Music2
  const [state, setState] = useState<GameState>("start")
  const [questions, setQuestions] = useState<Question[]>([])
  const [current, setCurrent] = useState(0)
  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME)
  const [chosen, setChosen] = useState<number | null>(null)
  const [answers, setAnswers] = useState<AnswerRecord[]>([])
  const [saving, setSaving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const totalPoints = answers.reduce((s, a) => s + a.points, 0)

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
  }

  const goToAnswer = useCallback(
    (chosenIndex: number | null, remaining: number) => {
      stopTimer()
      const q = questions[current]
      const correct = chosenIndex === q.correctIndex
      const pts = correct ? calcPoints(remaining) : 0
      setChosen(chosenIndex)
      setState("answer")
      setAnswers((prev) => [...prev, { question: q, chosen: chosenIndex, correct, points: pts }])

      setTimeout(() => {
        if (current + 1 >= questions.length) {
          setState("end")
        } else {
          setCurrent((c) => c + 1)
          setChosen(null)
          setTimeLeft(TOTAL_TIME)
          setState("question")
        }
      }, 1500)
    },
    [current, questions]
  )

  useEffect(() => {
    if (state !== "question") return
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          goToAnswer(null, 0)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return stopTimer
  }, [state, current, goToAnswer])

  async function startGame() {
    setState("loading")
    setAnswers([])
    setCurrent(0)
    setTimeLeft(TOTAL_TIME)
    setChosen(null)

    try {
      const res = await fetch(config.endpoint)
      const data = await res.json()
      if (!res.ok || !data.questions?.length) {
        setState("error")
        return
      }
      setQuestions(data.questions)
      setState("question")
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
      body: JSON.stringify({ game_type: config.gameType, points: totalPoints }),
    })
    setSaving(false)
  }, [saving, totalPoints, config.gameType])

  useEffect(() => {
    if (state === "end") saveScore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  if (state === "start") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative flex flex-col items-center gap-9 py-14 text-center"
      >
        {/* Floating 3D icon: accent glow, glossy highlight, slow Y-axis turn. */}
        <div className="relative [perspective:800px]">
          <div className={cn("absolute inset-0 rounded-[2rem] opacity-70 blur-2xl", config.iconClass)} />
          <motion.div
            animate={{ y: [0, -9, 0], rotateY: [-14, 14, -14] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformStyle: "preserve-3d" }}
            className={cn(
              "relative flex size-28 items-center justify-center rounded-[2rem] shadow-2xl ring-1 ring-white/10",
              config.iconClass
            )}
          >
            {/* glossy top highlight */}
            <span className="pointer-events-none absolute inset-x-3 top-2 h-1/3 rounded-full bg-white/30 blur-md" />
            <Icon className="size-14 drop-shadow-[0_6px_8px_rgba(0,0,0,0.45)]" />
          </motion.div>
        </div>

        <div className="space-y-3">
          <h1 className="text-5xl font-bold tracking-tight [font-family:var(--font-rounded)] sm:text-6xl">
            {config.title}
          </h1>
          <p className="text-lg text-muted-foreground [font-family:var(--font-rounded)]">{config.subtitle}</p>
        </div>

        {config.rules && config.rules.length > 0 && (
          <div className="grid w-full max-w-md gap-3.5">
            {config.rules.map((rule, i) => (
              <motion.div
                key={rule}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.1, type: "spring", stiffness: 260, damping: 22 }}
                className="rounded-[1.75rem] bg-card/70 px-6 py-4 text-center text-lg font-medium backdrop-blur-sm [font-family:var(--font-rounded)]"
              >
                {rule}
              </motion.div>
            ))}
          </div>
        )}

        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 + (config.rules?.length ?? 0) * 0.1 }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={startGame}
          className="group flex items-center gap-2 rounded-full bg-primary px-10 py-4 text-lg font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-colors [font-family:var(--font-rounded)] hover:bg-primary/90"
        >
          Start
          <ChevronRight className="size-5 transition-transform group-hover:translate-x-1" />
        </motion.button>
      </motion.div>
    )
  }

  if (state === "loading") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center gap-6 py-24 text-center"
      >
        <div className="relative flex size-20 items-center justify-center">
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-border border-t-primary" />
          <div className={cn("flex size-14 items-center justify-center rounded-2xl", config.iconClass)}>
            <Icon className="size-7" />
          </div>
        </div>
        <div>
          <p className="font-medium">Building your round…</p>
          <p className="mt-1 text-sm text-muted-foreground">Fetching lyrics — this can take a few seconds</p>
        </div>
      </motion.div>
    )
  }

  if (state === "error") {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <Icon className="size-10 text-muted-foreground/40" />
        <p className="font-medium">Couldn&apos;t start this game</p>
        <p className="text-sm text-muted-foreground">
          {config.errorHint ?? "Listen to more music on Spotify to unlock this game."}
        </p>
        <button onClick={() => setState("start")} className="mt-2 text-sm text-primary hover:underline">
          Try again
        </button>
      </div>
    )
  }

  if (state === "end") {
    const correct = answers.filter((a) => a.correct).length
    const percent = questions.length ? Math.round((correct / questions.length) * 100) : 0
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-8 py-12 text-center"
      >
        <div className="flex size-20 items-center justify-center rounded-3xl bg-primary/15">
          <Trophy className="size-10 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Final Score</p>
          <p className="mt-1 text-6xl font-bold text-primary">{totalPoints}</p>
          <p className="mt-2 text-muted-foreground">{correct}/{questions.length} correct · {percent}%</p>
        </div>

        <div className="w-full max-w-md space-y-2">
          {answers.map((a, i) => (
            <div key={i} className={cn("flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm", a.correct ? "bg-green-500/10" : "bg-red-500/10")}>
              <span className={cn("shrink-0 text-lg", a.correct ? "text-green-400" : "text-red-400")}>
                {a.correct ? "✓" : "✗"}
              </span>
              <span className="flex-1 truncate text-muted-foreground">{a.question.question}</span>
              <span className={cn("shrink-0 font-semibold tabular-nums", a.correct ? "text-green-400" : "text-muted-foreground/40")}>
                +{a.points}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={startGame}
          className="flex items-center gap-2 rounded-full border border-border bg-card px-6 py-2.5 text-sm font-medium transition-colors hover:bg-muted/40"
        >
          <RotateCcw className="size-4" /> Play Again
        </button>
      </motion.div>
    )
  }

  const q = questions[current]
  if (!q) return null

  return (
    <div className="mx-auto max-w-xl">
      {/* Question progress + circular timer */}
      <div className="mb-8 flex items-center gap-4">
        <span className="shrink-0 text-sm text-muted-foreground">{current + 1} / {questions.length}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: `${(current / questions.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <CircleTimer timeLeft={timeLeft} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={q.id}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.25 }}
        >
          {/* Question card */}
          <div className="mb-6 flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 text-center">
            {q.image ? (
              <img src={q.image} alt="" className="size-24 rounded-xl object-cover shadow-lg" />
            ) : config.imagePlaceholder ? (
              <div className="flex size-24 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 shadow-lg ring-1 ring-border">
                <span className="text-5xl font-bold text-primary/70 [font-family:var(--font-rounded)]">?</span>
              </div>
            ) : null}
            <p className="text-xl font-semibold leading-snug">{q.question}</p>
            {q.hint && <p className="text-sm text-muted-foreground">{q.hint}</p>}
          </div>

          {/* Options */}
          <div className="grid grid-cols-2 gap-3">
            {q.options.map((option, i) => {
              const isChosen = chosen === i
              const isCorrect = i === q.correctIndex
              const isAnswered = state === "answer"

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
                  onClick={() => goToAnswer(i, timeLeft)}
                  className={cn("rounded-xl border px-4 py-4 text-left text-sm font-medium transition-all", style)}
                >
                  {option}
                </motion.button>
              )
            })}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
