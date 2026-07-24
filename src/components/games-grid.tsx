"use client"

import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Headphones, Scale, Brain, Mic2, ChevronRight, Lock } from "lucide-react"
import { cn } from "@/lib/utils"

const GAMES = [
  {
    id: "guess-second",
    icon: Headphones,
    title: "Name That Song",
    description: "Pick an artist and guess their song from a 5-second clip — faster is better.",
    difficulty: "Medium",
    difficultyColor: "text-yellow-400",
    iconClass: "bg-primary/15 text-primary",
    gradientClass: "from-primary/10 to-transparent",
    available: true,
    href: "/app/games/name-song",
  },
  {
    id: "higher-lower",
    icon: Scale,
    title: "Higher or Lower",
    description: "Two artists, one question: who has more followers? Build a streak.",
    difficulty: "Easy",
    difficultyColor: "text-green-400",
    iconClass: "bg-violet-500/15 text-violet-400",
    gradientClass: "from-violet-500/10 to-transparent",
    available: false, // paused: needs the artist-metric pool (Spotify rate-limited)
    href: "/app/games/higher-lower",
  },
  {
    id: "music-quiz",
    icon: Brain,
    title: "Music Quiz",
    description: "Questions about artists, albums and facts from music history.",
    difficulty: "Easy",
    difficultyColor: "text-green-400",
    iconClass: "bg-blue-500/15 text-blue-400",
    gradientClass: "from-blue-500/10 to-transparent",
    available: true,
    href: "/app/games/music-quiz",
  },
  {
    id: "lyric-song",
    icon: Mic2,
    title: "Lyric → Song",
    description: "You're shown a line from a song — find out where it's from.",
    difficulty: "Medium",
    difficultyColor: "text-yellow-400",
    iconClass: "bg-orange-500/15 text-orange-400",
    gradientClass: "from-orange-500/10 to-transparent",
    available: true,
    href: "/app/games/lyric-song",
  },
]

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}

const card = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45 } },
}

export default function GamesGrid() {
  const router = useRouter()
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid gap-5 sm:grid-cols-2"
    >
      {GAMES.map((game) => {
        const Icon = game.icon
        return (
          <motion.div
            key={game.id}
            variants={card}
            whileHover={game.available ? { y: -4 } : {}}
            whileTap={game.available ? { scale: 0.98 } : {}}
            onClick={() => game.available && (game as any).href && router.push((game as any).href)}
            className={cn(
              "group relative flex flex-col gap-6 overflow-hidden rounded-2xl border bg-card p-7 transition-colors",
              game.available
                ? "cursor-pointer border-border hover:border-primary/40"
                : "cursor-not-allowed border-border opacity-60"
            )}
          >
            {/* Background gradient */}
            <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-60", game.gradientClass)} />

            <div className="relative flex items-start justify-between">
              <div className={cn("flex size-12 items-center justify-center rounded-2xl", game.iconClass)}>
                <Icon className="size-6" />
              </div>
              {!game.available && (
                <span className="flex items-center gap-1 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs text-muted-foreground">
                  <Lock className="size-3" /> Coming soon
                </span>
              )}
            </div>

            <div className="relative flex-1">
              <h3 className="text-lg font-semibold leading-snug text-balance">{game.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">{game.description}</p>
            </div>

            <div className="relative flex items-center justify-between">
              <span className={cn("text-xs font-medium", game.difficultyColor)}>
                {game.difficulty}
              </span>
              {game.available && (
                <span className="flex items-center gap-1 text-sm font-medium text-primary transition-[gap] duration-200 ease-out group-hover:gap-2">
                  Play <ChevronRight className="size-4" />
                </span>
              )}
            </div>
          </motion.div>
        )
      })}
    </motion.div>
  )
}
