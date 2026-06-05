"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { ArrowLeft, Headphones, Play, Brain, Mic2, Trophy, Gamepad2, Pencil, BarChart3, Music2 } from "lucide-react"
import type { User } from "@supabase/supabase-js"
import { cn } from "@/lib/utils"
import SpotifyStats from "@/components/spotify-stats"
import FavoriteSongs from "@/components/favorite-songs"
import EditProfile from "@/components/edit-profile"

type Score = {
  id: string
  game_type: string
  points: number
  played_at: string
}

type FavoriteSong = {
  id: string
  track_id: string
  name: string
  artists: string
  album_art: string | null
}

type MostPlayed = {
  track_id: string
  name: string
  artists: string | null
  album_art: string | null
  play_count: number
}

type Profile = {
  username: string | null
  bio: string | null
  custom_avatar_url: string | null
  banner_url: string | null
}

type Props = {
  user: User
  scores: Score[]
  totalPoints: number
  gamesPlayed: number
  rank: number | null
  favoriteSongs: FavoriteSong[]
  profile: Profile | null
  mostPlayed: MostPlayed[]
}

const GAME_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  "guess-second": { label: "Guess in a Second", icon: Headphones, color: "text-primary bg-primary/10" },
  "guess-clip":   { label: "Guess the Clip",    icon: Play,       color: "text-violet-400 bg-violet-500/10" },
  "music-quiz":   { label: "Music Quiz",         icon: Brain,      color: "text-blue-400 bg-blue-500/10" },
  "lyric-song":   { label: "Lyric → Song",       icon: Mic2,       color: "text-orange-400 bg-orange-500/10" },
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function ProfileView({ user, scores, totalPoints, gamesPlayed, rank, favoriteSongs, profile, mostPlayed }: Props) {
  const spotifyName =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email?.split("@")[0] ??
    "Anonymous"
  const spotifyAvatar = user.user_metadata?.avatar_url ?? null

  const [editing, setEditing] = useState(false)
  const [profileState, setProfileState] = useState({
    username: profile?.username || spotifyName,
    bio: profile?.bio || "",
    avatarUrl: profile?.custom_avatar_url ?? spotifyAvatar,
    bannerUrl: profile?.banner_url ?? null,
  })

  const displayName = profileState.username || spotifyName
  const avatarUrl = profileState.avatarUrl
  const bio = profileState.bio
  const bannerUrl = profileState.bannerUrl

  const joinedDate = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(
    new Date(user.created_at)
  )

  const stats = [
    { label: "Total Points", value: totalPoints.toLocaleString("en"), icon: Trophy },
    { label: "Games Played", value: gamesPlayed.toString(), icon: Gamepad2 },
    { label: "Global Rank",  value: rank ? `#${rank}` : "—", icon: Trophy },
  ]

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-40 top-20 size-[500px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-40 top-60 size-[500px] rounded-full bg-primary/8 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-3xl px-6 pt-24 pb-16">

        {/* Back link */}
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Home
        </Link>

        {/* Profile header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10 overflow-hidden rounded-3xl border border-border bg-card"
        >
          {/* Banner */}
          <div className="relative h-36 sm:h-44">
            {bannerUrl ? (
              <img src={bannerUrl} alt="" className="size-full object-cover" />
            ) : (
              <div className="size-full bg-gradient-to-br from-primary/30 via-primary/10 to-transparent" />
            )}
            <button
              onClick={() => setEditing(true)}
              className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 px-3.5 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/60"
            >
              <Pencil className="size-3.5" />
              Edit
            </button>
          </div>

          {/* Avatar + name */}
          <div className="relative z-10 px-6 pb-6">
            <div className="-mt-10 mb-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="size-20 rounded-full object-cover ring-4 ring-card"
                />
              ) : (
                <div className="flex size-20 items-center justify-center rounded-full bg-primary/20 text-3xl font-bold text-primary ring-4 ring-card">
                  {displayName[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <h1 className="text-2xl font-bold">{displayName}</h1>
            {bio && <p className="mt-1 text-sm text-foreground/80">{bio}</p>}
            <p className="mt-1 text-sm text-muted-foreground">Joined {joinedDate}</p>
          </div>
        </motion.div>

        {/* Stats cards */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-10 grid grid-cols-3 gap-4"
        >
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-5"
            >
              <span className="text-2xl font-bold text-primary">{stat.value}</span>
              <span className="text-sm text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </motion.div>

        {/* Favorite songs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-10"
        >
          <FavoriteSongs initialFavorites={favoriteSongs} />
        </motion.div>

        {/* Most played (tracked by us) */}
        {mostPlayed.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.22 }}
            className="mb-10"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="size-4 text-primary" />
                <h2 className="text-lg font-semibold">Your Most Played</h2>
              </div>
              <Link href="/app/stats" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                View all
              </Link>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {mostPlayed.map((track, i) => (
                <a
                  key={track.track_id}
                  href={`https://open.spotify.com/track/${track.track_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40",
                    i < mostPlayed.length - 1 && "border-b border-border"
                  )}
                >
                  <span className="w-5 shrink-0 text-sm font-semibold text-muted-foreground">{i + 1}</span>
                  {track.album_art ? (
                    <img src={track.album_art} alt={track.name} className="size-9 shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Music2 className="size-4 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{track.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{track.artists}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
                    {Number(track.play_count)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      {Number(track.play_count) === 1 ? "play" : "plays"}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </motion.div>
        )}

        {/* Spotify stats */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="mb-10"
        >
          <SpotifyStats />
        </motion.div>

        {/* Recent activity */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <h2 className="mb-4 text-lg font-semibold">Recent Activity</h2>

          {scores.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-14 text-center">
              <Gamepad2 className="size-10 text-muted-foreground/40" />
              <p className="font-medium">No games played yet</p>
              <p className="text-sm text-muted-foreground">
                Head back to the home page and pick a game to start earning points.
              </p>
              <Link
                href="/"
                className="mt-2 inline-flex h-8 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
              >
                Choose a Game
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {scores.map((score, i) => {
                const meta = GAME_META[score.game_type]
                const Icon = meta?.icon ?? Gamepad2
                return (
                  <div
                    key={score.id}
                    className={cn(
                      "flex items-center gap-4 px-5 py-4",
                      i < scores.length - 1 && "border-b border-border"
                    )}
                  >
                    <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", meta?.color ?? "bg-muted text-muted-foreground")}>
                      <Icon className="size-4" />
                    </div>
                    <span className="flex-1 text-sm font-medium">{meta?.label ?? score.game_type}</span>
                    <span className="text-sm font-semibold text-primary">+{score.points} pts</span>
                    <span className="w-16 text-right text-xs text-muted-foreground">{timeAgo(score.played_at)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>
      </div>

      <EditProfile
        open={editing}
        onClose={() => setEditing(false)}
        userId={user.id}
        initial={{
          username: profileState.username,
          bio: profileState.bio,
          avatarUrl: profileState.avatarUrl,
          bannerUrl: profileState.bannerUrl,
        }}
        onSaved={(data) => setProfileState(data)}
      />
    </div>
  )
}
