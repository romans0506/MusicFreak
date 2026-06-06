"use client"

import { motion } from "framer-motion"
import { Headphones, Scale, Brain, Mic2, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const GAMES = [
  {
    id: "guess-second",
    icon: Headphones,
    title: "Name That Song",
    description: "Pick an artist and guess their song from a 5-second clip",
    difficulty: "Medium",
    difficultyColor: "text-yellow-400",
    iconClass: "bg-primary/10 text-primary",
    borderClass: "border-primary/20 hover:border-primary/40",
  },
  {
    id: "higher-lower",
    icon: Scale,
    title: "Higher or Lower",
    description: "Two artists, one question: who has more followers?",
    difficulty: "Easy",
    difficultyColor: "text-green-400",
    iconClass: "bg-violet-500/10 text-violet-400",
    borderClass: "border-violet-500/20 hover:border-violet-500/40",
  },
  {
    id: "music-quiz",
    icon: Brain,
    title: "Music Quiz",
    description: "Questions about artists, albums and facts from music history",
    difficulty: "Easy",
    difficultyColor: "text-green-400",
    iconClass: "bg-blue-500/10 text-blue-400",
    borderClass: "border-blue-500/20 hover:border-blue-500/40",
  },
  {
    id: "lyric-song",
    icon: Mic2,
    title: "Lyric → Song",
    description: "You're shown a line from a song — find out where it's from",
    difficulty: "Medium",
    difficultyColor: "text-yellow-400",
    iconClass: "bg-orange-500/10 text-orange-400",
    borderClass: "border-orange-500/20 hover:border-orange-500/40",
  },
]

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
}

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
}

export default function GamesPreview() {
  return (
    <section id="games" className="py-24">
      <div className="mx-auto max-w-6xl px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Choose a Game</h2>
          <p className="mt-3 text-muted-foreground">
            Four ways to test your music knowledge
          </p>
        </motion.div>

        {/* Grid */}
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {GAMES.map((game) => {
            const Icon = game.icon
            return (
              <motion.div
                key={game.id}
                variants={cardVariants}
                whileHover={{ y: -5 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={cn(
                  "group flex cursor-pointer flex-col gap-5 rounded-2xl border bg-card p-6 transition-colors",
                  game.borderClass
                )}
              >
                <div
                  className={cn(
                    "flex size-11 items-center justify-center rounded-xl",
                    game.iconClass
                  )}
                >
                  <Icon className="size-5" />
                </div>

                <div className="flex-1">
                  <h3 className="font-semibold leading-snug">{game.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {game.description}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <span className={cn("text-xs font-medium", game.difficultyColor)}>
                    {game.difficulty}
                  </span>
                  <Button size="xs" variant="ghost" className="gap-0.5 text-muted-foreground">
                    Play <ChevronRight className="size-3" />
                  </Button>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
