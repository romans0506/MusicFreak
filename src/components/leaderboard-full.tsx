"use client"

import { motion } from "framer-motion"
import { Trophy } from "lucide-react"
import { cn } from "@/lib/utils"

type Leader = {
  id: string
  username: string | null
  total_points: number
  avatar_url?: string | null
}

const MEDAL: Record<number, string> = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
}

export default function LeaderboardFull({
  leaders,
  currentUserId,
}: {
  leaders: Leader[]
  currentUserId: string | null
}) {
  if (leaders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-20 text-center">
        <Trophy className="size-10 text-muted-foreground/40" />
        <p className="font-medium">No scores yet</p>
        <p className="text-sm text-muted-foreground">Be the first to play and claim the top spot.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {leaders.map((leader, i) => {
        const rank = i + 1
        const isMe = leader.id === currentUserId
        return (
          <motion.div
            key={leader.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: i * 0.04 }}
            className={cn(
              "flex items-center gap-4 px-6 py-4 transition-colors",
              i < leaders.length - 1 && "border-b border-border",
              isMe && "bg-primary/5",
              rank <= 3 && "bg-gradient-to-r from-primary/5 to-transparent"
            )}
          >
            {/* Rank */}
            <div className="w-8 shrink-0 text-center">
              {MEDAL[rank] ? (
                <span className="text-lg">{MEDAL[rank]}</span>
              ) : (
                <span className="text-sm font-medium text-muted-foreground">#{rank}</span>
              )}
            </div>

            {/* Avatar */}
            {leader.avatar_url ? (
              <img
                src={leader.avatar_url}
                alt={leader.username ?? ""}
                className="size-9 shrink-0 rounded-full object-cover outline outline-1 -outline-offset-1 outline-white/10"
              />
            ) : (
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                {(leader.username ?? "?")[0]?.toUpperCase()}
              </div>
            )}

            {/* Name */}
            <div className="flex-1 min-w-0">
              <span className={cn("truncate text-sm font-medium", isMe && "text-primary")}>
                {leader.username ?? "Anonymous"}
                {isMe && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
              </span>
            </div>

            {/* Points */}
            <span className={cn("text-sm font-bold tabular-nums", rank <= 3 ? "text-primary" : "text-foreground")}>
              {leader.total_points.toLocaleString("en")} pts
            </span>
          </motion.div>
        )
      })}
    </div>
  )
}
