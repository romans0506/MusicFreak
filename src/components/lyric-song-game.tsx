"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { ListMusic, UserRound, ChevronRight, ArrowLeft, Mic2 } from "lucide-react"
import MultipleChoiceGame, { type QuizConfig } from "@/components/multiple-choice-game"
import ArtistPicker, { type PickArtist } from "@/components/artist-picker"

// Lyric → Song wrapper: choose a mode, then play the shared MultipleChoiceGame.
//   - "top"    → lyrics from your Spotify top tracks
//   - "artist" → pick an artist; lyrics from their iTunes catalog
// The chosen mode just swaps the generator endpoint MultipleChoiceGame fetches.

type Mode = "top" | "artist"

const BASE = "/api/games/lyric-song/generate"

function topConfig(): QuizConfig {
  return {
    title: "Lyric → Song",
    subtitle: "Read a line, name the song it's from",
    gameType: "lyric-song",
    endpoint: BASE,
    icon: "mic",
    iconClass: "bg-gradient-to-b from-red-400 to-red-600 text-white",
    rules: ["15 seconds per lyric", "Faster answers score more", "Built from your top tracks"],
    errorHint: "We couldn't find lyrics for enough of your top tracks. Listen to more music and try again.",
  }
}

function artistConfig(artist: PickArtist): QuizConfig {
  return {
    title: "Lyric → Song",
    subtitle: `Guess ${artist.name}'s songs from a line`,
    gameType: "lyric-song",
    endpoint: `${BASE}?artistName=${encodeURIComponent(artist.name)}`,
    icon: "mic",
    iconClass: "bg-gradient-to-b from-red-400 to-red-600 text-white",
    rules: ["15 seconds per lyric", "Faster answers score more", `${artist.name}'s catalogue`],
    errorHint: `We couldn't find lyrics for enough of ${artist.name}'s songs. Try another artist.`,
  }
}

export default function LyricSongGame() {
  const [mode, setMode] = useState<Mode | null>(null)
  const [artist, setArtist] = useState<PickArtist | null>(null)

  function reset() {
    setMode(null)
    setArtist(null)
  }

  const config = mode === "top" ? topConfig() : artist ? artistConfig(artist) : null

  // A mode is fully chosen — hand off to the gameplay engine.
  if (config) {
    return (
      <div>
        <button
          onClick={reset}
          className="mb-2 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Change mode
        </button>
        <MultipleChoiceGame config={config} />
      </div>
    )
  }

  // "By artist" chosen but no artist yet → show the picker.
  if (mode === "artist") {
    return (
      <div>
        <button
          onClick={reset}
          className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back
        </button>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-3xl bg-orange-500/15">
            <UserRound className="size-8 text-orange-400" />
          </div>
          <h1 className="text-2xl font-bold">Pick an artist</h1>
          <p className="mt-1 text-sm text-muted-foreground">Guess their songs from a lyric line</p>
        </div>
        <ArtistPicker onPick={setArtist} />
      </div>
    )
  }

  // Mode chooser.
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-8 py-12 text-center"
    >
      <div className="flex size-20 items-center justify-center rounded-3xl bg-gradient-to-b from-red-400 to-red-600 text-white shadow-xl shadow-red-500/25">
        <Mic2 className="size-10 drop-shadow-[0_3px_4px_rgba(0,0,0,0.4)]" />
      </div>
      <div>
        <h1 className="text-4xl font-bold tracking-tight [font-family:var(--font-rounded)]">Lyric → Song</h1>
        <p className="mt-2 text-muted-foreground">Choose how you want to play</p>
      </div>

      <div className="grid w-full max-w-md gap-4 sm:grid-cols-2">
        <button
          onClick={() => setMode("top")}
          className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center transition-all hover:border-primary/40 hover:bg-muted/40"
        >
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <ListMusic className="size-7" />
          </div>
          <div>
            <p className="font-semibold">Your Top 50</p>
            <p className="mt-1 text-xs text-muted-foreground">Lyrics from tracks you actually listen to</p>
          </div>
          <span className="flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            Play <ChevronRight className="size-4" />
          </span>
        </button>

        <button
          onClick={() => setMode("artist")}
          className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center transition-all hover:border-primary/40 hover:bg-muted/40"
        >
          <div className="flex size-14 items-center justify-center rounded-2xl bg-orange-500/15 text-orange-400">
            <UserRound className="size-7" />
          </div>
          <div>
            <p className="font-semibold">By Artist</p>
            <p className="mt-1 text-xs text-muted-foreground">Pick any artist and guess their songs</p>
          </div>
          <span className="flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            Choose <ChevronRight className="size-4" />
          </span>
        </button>
      </div>
    </motion.div>
  )
}
