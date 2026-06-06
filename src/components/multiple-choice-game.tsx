"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Trophy, RotateCcw, ChevronRight, Clock, Brain, Mic2, Music2, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// Server Components can't pass a component (function) to a Client Component,
// so config carries an icon *key* and we map it here.
const ICONS: Record<string, LucideIcon> = { brain: Brain, mic: Mic2, music: Music2 }

const TOTAL_TIME = 15
const MAX_POINTS_PER_Q = 150

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
        className="flex flex-col items-center gap-8 py-12 text-center"
      >
        <div className={cn("flex size-20 items-center justify-center rounded-3xl", config.iconClass)}>
          <Icon className="size-10" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{config.title}</h1>
          <p className="mt-2 text-muted-foreground">{config.subtitle}</p>
        </div>
        {config.rules && config.rules.length > 0 && (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            {config.rules.map((r) => (
              <p key={r}>{r}</p>
            ))}
          </div>
        )}
        <button
          onClick={startGame}
          className="flex items-center gap-2 rounded-full bg-primary px-8 py-3 text-base font-semibold text-primary-foreground transition-all hover:bg-primary/80 hover:scale-105"
        >
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
      {/* Progress + timer */}
      <div className="mb-6 flex items-center gap-4">
        <div className="flex-1 overflow-hidden rounded-full bg-muted h-1.5">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: `${(current / questions.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <span className="text-sm text-muted-foreground shrink-0">{current + 1} / {questions.length}</span>
        <div className={cn("flex items-center gap-1 text-sm font-semibold tabular-nums shrink-0", timeLeft <= 5 ? "text-red-400" : "text-muted-foreground")}>
          <Clock className="size-3.5" />
          {timeLeft}s
        </div>
      </div>

      {/* Timer bar */}
      <div className="mb-8 h-1 overflow-hidden rounded-full bg-muted">
        <motion.div
          className={cn("h-full rounded-full transition-colors", timeLeft <= 5 ? "bg-red-400" : "bg-primary")}
          animate={{ width: `${(timeLeft / TOTAL_TIME) * 100}%` }}
          transition={{ duration: 0.9, ease: "linear" }}
        />
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
            {q.image && (
              <img src={q.image} alt="" className="size-24 rounded-xl object-cover shadow-lg" />
            )}
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
