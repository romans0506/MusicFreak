"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Music2, BarChart3, Flame, Sparkles, Trophy, Compass, Moon, Heart, Clock, Lock, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PlayCount, GenreSlice } from "@/app/app/stats/page"
import type { Badge, BadgeId } from "@/lib/stats"

const BADGE_ICONS: Record<BadgeId, LucideIcon> = {
  "first-play": Sparkles,
  century: Trophy,
  explorer: Compass,
  dedicated: Flame,
  "night-owl": Moon,
  superfan: Heart,
}

type Range = "week" | "month" | "all"

const RANGES: { key: Range; label: string }[] = [
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
]

type ListenKey = "day" | "week" | "month" | "year"
type Listening = { day: number; week: number; month: number; year: number; total: number }

const PERIODS: { key: ListenKey; label: string; unlockDays: number }[] = [
  { key: "day", label: "Today", unlockDays: 0 },
  { key: "week", label: "This Week", unlockDays: 7 },
  { key: "month", label: "This Month", unlockDays: 30 },
  { key: "year", label: "This Year", unlockDays: 365 },
]

/** ms → "Xh Ym" (or "Ym" under an hour). */
function formatListen(ms: number): string {
  const minutes = Math.round(ms / 60000)
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
  return `${minutes}m`
}

export default function StatsView({
  week,
  month,
  all,
  totalPlays,
  streak,
  badges,
  hourly,
  genres,
  listening,
  trackedDays,
}: {
  week: PlayCount[]
  month: PlayCount[]
  all: PlayCount[]
  totalPlays: number
  streak: { current: number; longest: number }
  badges: Badge[]
  hourly: number[]
  genres: GenreSlice[]
  listening: Listening
  trackedDays: number
}) {
  const maxHour = Math.max(1, ...hourly)
  const peakHour = hourly.indexOf(Math.max(...hourly))
  const maxGenre = genres.length > 0 ? genres[0].count : 1
  const [range, setRange] = useState<Range>("all")
  const tracks = range === "week" ? week : range === "month" ? month : all
  const max = tracks.length > 0 ? Number(tracks[0].play_count) : 1

  return (
    <div>
      {/* Streak banner */}
      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 to-transparent p-5">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/20">
          <Flame className={cn("size-7", streak.current > 0 ? "text-primary" : "text-muted-foreground/50")} />
        </div>
        <div className="flex-1">
          <p className="text-2xl font-bold">
            {streak.current} <span className="text-base font-medium text-muted-foreground">day{streak.current === 1 ? "" : "s"} streak</span>
          </p>
          <p className="text-sm text-muted-foreground">
            {streak.current > 0
              ? "Keep listening daily to grow it 🔥"
              : "Listen today to start a streak"}
            {streak.longest > 0 && <> · Longest: {streak.longest}</>}
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:max-w-md">
        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-5">
          <span className="text-2xl font-bold text-primary">{totalPlays.toLocaleString("en")}</span>
          <span className="text-sm text-muted-foreground">Total plays tracked</span>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-5">
          <span className="text-2xl font-bold text-primary">{all.length.toLocaleString("en")}</span>
          <span className="text-sm text-muted-foreground">Unique songs</span>
        </div>
      </div>

      {/* Listening time */}
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <Clock className="size-4 text-primary" />
          <h2 className="text-lg font-semibold">Listening time</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          {listening.total > 0 ? (
            <>
              You&apos;ve listened for{" "}
              <span className="font-semibold text-foreground">{formatListen(listening.total)}</span>{" "}
              ({Math.round(listening.total / 60000).toLocaleString("en")} minutes) since you started.
            </>
          ) : (
            "Keep the app open while you listen on Spotify — your minutes will add up here."
          )}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PERIODS.map((p) => {
            const ms = listening[p.key]
            const locked = trackedDays < p.unlockDays
            const remaining = p.unlockDays - trackedDays
            return (
              <div key={p.key} className="flex min-h-[104px] flex-col justify-center gap-1 rounded-2xl border border-border bg-card p-5">
                {locked ? (
                  <div className="flex flex-col items-center gap-1.5 text-center">
                    <Lock className="size-5 text-muted-foreground/50" />
                    <span className="text-sm font-medium text-muted-foreground">{p.label}</span>
                    <span className="text-xs text-muted-foreground/70">
                      Unlocks in {remaining} day{remaining === 1 ? "" : "s"}
                    </span>
                  </div>
                ) : (
                  <>
                    <span className="text-2xl font-bold text-primary">{formatListen(ms)}</span>
                    <span className="text-sm text-muted-foreground">{p.label}</span>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Badges */}
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="text-lg font-semibold">Badges</h2>
          <span className="text-sm text-muted-foreground">
            {badges.filter((b) => b.earned).length}/{badges.length}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {badges.map((badge) => {
            const Icon = BADGE_ICONS[badge.id]
            return (
              <div
                key={badge.id}
                title={badge.description}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border p-4 transition-colors",
                  badge.earned
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-card opacity-50"
                )}
              >
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl",
                    badge.earned ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground/50"
                  )}
                >
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{badge.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{badge.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Charts */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        {/* When you listen */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />
            <h2 className="text-base font-semibold">When you listen</h2>
          </div>
          {totalPlays === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No plays tracked yet</p>
          ) : (
            <>
              <div className="flex h-28 items-end gap-[3px]">
                {hourly.map((plays, h) => (
                  <div key={h} className="group relative flex-1">
                    <div
                      className={cn(
                        "w-full rounded-t-sm transition-colors",
                        h === peakHour ? "bg-primary" : "bg-primary/35 group-hover:bg-primary/60"
                      )}
                      style={{ height: `${Math.max(2, (plays / maxHour) * 100)}px` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Peak hour: <span className="font-medium text-foreground">{peakHour}:00–{peakHour + 1}:00</span>
              </p>
            </>
          )}
        </div>

        {/* Top genres */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Music2 className="size-4 text-primary" />
            <h2 className="text-base font-semibold">Top genres</h2>
          </div>
          {genres.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Listen to more music to see your genres
            </p>
          ) : (
            <div className="space-y-2.5">
              {genres.map((g) => (
                <div key={g.genre}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="truncate capitalize">{g.genre}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{g.count}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${(g.count / maxGenre) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Range pills */}
      <div className="mb-5 inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/60 p-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200",
              range === r.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* List */}
      {tracks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-20 text-center">
          <BarChart3 className="size-10 text-muted-foreground/40" />
          <p className="font-medium">No plays tracked yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Keep the app open while you listen on Spotify — your plays will show up here.
          </p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={range}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden rounded-2xl border border-border bg-card"
          >
            {tracks.map((track, i) => {
              const count = Number(track.play_count)
              return (
                <a
                  key={track.track_id}
                  href={`https://open.spotify.com/track/${track.track_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40",
                    i < tracks.length - 1 && "border-b border-border"
                  )}
                >
                  <span className="w-5 shrink-0 text-sm font-semibold text-muted-foreground">{i + 1}</span>
                  {track.album_art ? (
                    <img src={track.album_art} alt={track.name} className="size-10 shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Music2 className="size-4 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{track.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{track.artists}</p>
                    {/* Play-count bar */}
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${(count / max) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
                    {count}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      {count === 1 ? "play" : "plays"}
                    </span>
                  </span>
                </a>
              )
            })}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}
