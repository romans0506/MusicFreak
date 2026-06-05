"use client"

import { motion } from "framer-motion"
import { Music, Quote } from "lucide-react"

type DailyContent = {
  song_title: string
  artist: string
  year: string | null
  lyric: string
  gradient: string | null
} | null

export default function SongOfDay({ song }: { song: DailyContent }) {
  if (!song) return null

  const gradient = song.gradient ?? "from-violet-600 via-purple-500 to-fuchsia-500"

  return (
    <section className="py-24">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="mb-10 flex items-center gap-2">
            <Music className="size-4 text-primary" />
            <span className="text-sm font-semibold uppercase tracking-widest text-primary">
              Lyric of the Day
            </span>
          </div>

          <div className="flex flex-col gap-8 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:items-start sm:p-10">
            <div
              className={`flex size-28 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-2xl sm:size-40 ${gradient}`}
            >
              <Music className="size-12 text-white/70" />
            </div>

            <div className="flex flex-col gap-5">
              <Quote className="size-8 text-primary/30" />
              <blockquote className="whitespace-pre-line text-2xl font-semibold leading-snug sm:text-3xl">
                {song.lyric}
              </blockquote>
              <div>
                <p className="text-lg font-semibold">{song.song_title}</p>
                <p className="text-muted-foreground">
                  {song.artist}{song.year ? ` · ${song.year}` : ""}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
