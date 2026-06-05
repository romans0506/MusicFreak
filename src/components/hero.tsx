"use client"

import { motion } from "framer-motion"
import { Headphones, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import SignInButton from "@/components/sign-in-button"

const STATS = [
  { label: "Players", value: "12,000+" },
  { label: "Rounds Played", value: "450,000+" },
  { label: "Songs in Database", value: "50,000+" },
]

export default function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden flex items-center">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-60 -top-20 size-[700px] rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute -right-60 bottom-0 size-[500px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 pt-32 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: "easeOut" }}
          className="flex max-w-2xl flex-col items-start gap-8"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary">
            <TrendingUp className="size-3.5" />
            Music Gaming Platform
          </div>

          <h1 className="text-5xl font-bold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
            Test your <br />
            <span className="text-primary">music knowledge</span>
          </h1>

          <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
            Guess songs from snippets, take quizzes about artists and compete with friends on the leaderboard. Connect Spotify — and we'll show your personal stats.
          </p>

          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              className="gap-2"
              onClick={() => document.getElementById("games")?.scrollIntoView({ behavior: "smooth" })}
            >
              <Headphones className="size-4" />
              Start Playing
            </Button>
            <SignInButton size="lg" variant="outline" />
          </div>

          <div className="flex flex-wrap gap-10 border-t border-border pt-6">
            {STATS.map((stat) => (
              <div key={stat.label} className="flex flex-col gap-0.5">
                <span className="text-2xl font-bold text-primary">{stat.value}</span>
                <span className="text-sm text-muted-foreground">{stat.label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
