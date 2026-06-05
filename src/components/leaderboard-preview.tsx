"use client"

import { motion } from "framer-motion"
import { Trophy, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Leader = {
  id: string
  username: string | null
  total_points: number
  avatar_url?: string | null
}

const RANK_MEDALS = ["🥇", "🥈", "🥉"]

const AVATAR_COLORS = [
  "bg-primary/20 text-primary",
  "bg-violet-500/20 text-violet-400",
  "bg-blue-500/20 text-blue-400",
  "bg-orange-500/20 text-orange-400",
  "bg-rose-500/20 text-rose-400",
]

export default function LeaderboardPreview({ leaders }: { leaders: Leader[] }) {
  if (leaders.length === 0) return null

  return (
    <section className="py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-8 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Trophy className="size-5 text-primary" />
              <h2 className="text-3xl font-bold tracking-tight">Weekly Leaders</h2>
            </div>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              All Players <ChevronRight className="size-4" />
            </Button>
          </motion.div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {leaders.map((leader, i) => {
              const initials = leader.username
                ? leader.username.slice(0, 2).toUpperCase()
                : "??"
              const displayName = leader.username ?? "Anonymous"

              return (
                <motion.div
                  key={leader.id}
                  initial={{ opacity: 0, x: -16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.07 }}
                  className={cn(
                    "flex items-center gap-4 px-6 py-4",
                    i < leaders.length - 1 && "border-b border-border"
                  )}
                >
                  <span className="w-7 text-center text-base">
                    {i < 3
                      ? RANK_MEDALS[i]
                      : <span className="text-sm font-semibold text-muted-foreground">{i + 1}</span>
                    }
                  </span>

                  {leader.avatar_url ? (
                    <img
                      src={leader.avatar_url}
                      alt={displayName}
                      className="size-9 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      AVATAR_COLORS[i] ?? "bg-muted text-muted-foreground"
                    )}>
                      {initials}
                    </div>
                  )}

                  <span className="flex-1 font-medium">{displayName}</span>

                  <span className="font-semibold tabular-nums text-primary">
                    {leader.total_points.toLocaleString("en")} pts
                  </span>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
