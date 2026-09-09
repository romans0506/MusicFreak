"use client"

import { useState, useRef, useTransition, useEffect } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowLeft, Heart, Play, Pause, Music2, Users, Loader2, Trophy, Gamepad2, Globe, CalendarDays, Ticket, ChevronDown } from "lucide-react"
import countries from "i18n-iso-countries"
import enLocale from "i18n-iso-countries/langs/en.json"
import { cn } from "@/lib/utils"
import type { LiveEvent } from "@/lib/ticketmaster"

countries.registerLocale(enLocale)

type SpotifyTrack = {
  id: string
  name: string
  duration_ms: number
  preview_url: string | null
  album: { name: string; images: { url: string }[] }
  popularity: number
  external_urls?: { spotify?: string }
}


type SpotifyArtist = {
  id: string
  name: string
  genres: string[]
  popularity: number
  followers: { total: number }
  images: { url: string }[]
}

type Fan = {
  user_id: string
  profiles: { username: string | null; avatar_url: string | null; custom_avatar_url: string | null } | null
}

type LovedSong = {
  track_id: string
  name: string
  artists: string
  album_art: string | null
  count: number
}

type GameLeader = {
  user_id: string
  username: string | null
  avatar_url: string | null
  points: number
}

type Props = {
  artist: SpotifyArtist
  artistId: string
  fans: Fan[]
  isFavorited: boolean
  lovedSongs: LovedSong[]
  gameLeaders: GameLeader[]
  currentUserId: string | null
  topCountries: { country: string; listeners: number }[]
  toggleFavorite: (
    artistId: string,
    artistName: string,
    artistImage: string,
    isFavorited: boolean
  ) => Promise<{ error?: string; success?: boolean }>
}

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** Dates shown before the expander. A long tour is 40+ nights — not a wall. */
const EVENT_PREVIEW_COUNT = 5

// Event dates arrive as a bare local "YYYY-MM-DD". Parsing that with Date()
// would re-interpret it as UTC midnight and shift the day backwards for anyone
// west of Greenwich, so read the parts straight off the string instead.
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]

function monthLabel(date: string) {
  return MONTHS[Number(date.slice(5, 7)) - 1] ?? ""
}

function dayLabel(date: string) {
  return String(Number(date.slice(8, 10)))
}

/** Year, shown only when the date isn't in the current one. */
function yearLabel(date: string) {
  const year = date.slice(0, 4)
  return year === String(new Date().getFullYear()) ? "" : year
}

function formatFollowers(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toString()
}


export default function ArtistDetail({ artist, artistId, fans, isFavorited, lovedSongs, gameLeaders, currentUserId, topCountries, toggleFavorite }: Props) {
  const [favorited, setFavorited] = useState(isFavorited)
  const [fanCount, setFanCount] = useState(fans.length)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [tracks, setTracks] = useState<SpotifyTrack[]>([])
  const [tracksLoading, setTracksLoading] = useState(true)
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  // null until we know: no TICKETMASTER_API_KEY means hide the section, which
  // is not the same as "this artist has no shows".
  const [eventsConfigured, setEventsConfigured] = useState<boolean | null>(null)
  const [showAllEvents, setShowAllEvents] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPending, startTransition] = useTransition()

  const artistImage = artist.images[0]?.url
  const visibleEvents = showAllEvents ? events : events.slice(0, EVENT_PREVIEW_COUNT)

  useEffect(() => {
    fetch(`/api/spotify/artist-tracks?artistId=${artistId}`)
      .then(async (res) => {
        const data = await res.json()
        if (res.ok) setTracks(data.tracks ?? [])
      })
      .finally(() => setTracksLoading(false))
  }, [artistId])

  useEffect(() => {
    fetch(`/api/events?artistId=${artistId}&name=${encodeURIComponent(artist.name)}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) return
        setEvents(data.events ?? [])
        setEventsConfigured(data.configured !== false)
      })
      .finally(() => setEventsLoading(false))
  }, [artistId, artist.name])

  function handleToggleFavorite() {
    const next = !favorited
    setFavorited(next)
    setFanCount((c) => c + (next ? 1 : -1))
    startTransition(async () => {
      const res = await toggleFavorite(artist.id, artist.name, artistImage ?? "", favorited)
      if (res.error) {
        setFavorited(favorited)
        setFanCount(fans.length)
      }
    })
  }

  function handlePlay(track: SpotifyTrack) {
    if (!track.preview_url) return
    if (playingId === track.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    audioRef.current?.pause()
    const audio = new Audio(track.preview_url)
    audio.volume = 0.7
    audio.play()
    audio.onended = () => setPlayingId(null)
    audioRef.current = audio
    setPlayingId(track.id)
  }

  return (
    <div className="-mx-6 -mt-24">
      {/* Hero with artist background image */}
      <div className="relative px-6 pb-10 pt-24 overflow-hidden">
        {/* Background image */}
        {artistImage && (
          <div
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              backgroundImage: `url(${artistImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center 20%",
              filter: "blur(60px) brightness(0.35) saturate(1.4)",
              transform: "scale(1.1)",
            }}
          />
        )}
        {/* Gradient fade to background at bottom */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-40 bg-gradient-to-t from-background to-transparent" />
        {/* Back */}
        <Link
          href="/app/artists"
          className="relative z-20 mb-8 inline-flex items-center gap-1.5 text-sm text-white/70 transition-colors hover:text-white"
        >
          <ArrowLeft className="size-4" />
          All Artists
        </Link>

        {/* Artist header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-20 flex flex-col gap-6 sm:flex-row sm:items-end"
        >
          {artistImage ? (
            <img
              src={artistImage}
              alt={artist.name}
              className="size-40 rounded-2xl object-cover shadow-2xl sm:size-52"
            />
          ) : (
            <div className="flex size-40 items-center justify-center rounded-2xl bg-white/10 sm:size-52">
              <Music2 className="size-16 text-white/40" />
            </div>
          )}

          <div className="flex flex-col gap-3 pb-2">
            {(artist.genres?.length ?? 0) > 0 && (
              <p className="text-xs font-semibold uppercase tracking-widest text-white/60">
                {artist.genres.slice(0, 2).join(" · ")}
              </p>
            )}
            <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-lg sm:text-6xl">
              {artist.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/70">
              {artist.followers?.total != null && (
                <span>{formatFollowers(artist.followers.total)} followers on Spotify</span>
              )}
              <span className="flex items-center gap-1">
                <Users className="size-3.5" />
                {fanCount} fan{fanCount !== 1 ? "s" : ""} on MusicFreak
              </span>
            </div>

            <button
              onClick={handleToggleFavorite}
              disabled={isPending}
              className={cn(
                "mt-1 flex w-fit items-center gap-2 rounded-full border px-5 py-2 text-sm font-medium backdrop-blur-sm transition-[color,background-color,border-color,scale] duration-150 ease-out active:scale-[0.96]",
                favorited
                  ? "border-white/50 bg-white/20 text-white hover:bg-white/30"
                  : "border-white/30 bg-black/20 text-white/80 hover:border-white/50 hover:text-white"
              )}
            >
              <Heart className={cn("size-4 transition-colors", favorited && "fill-current")} />
              {favorited ? "In favorites" : "Add to favorites"}
            </button>
          </div>
        </motion.div>
      </div>

      {/* Content */}
      <div className="px-6 pt-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Top tracks */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="lg:col-span-2"
          >
            <h2 className="mb-4 text-lg font-semibold">Your Top Tracks by This Artist</h2>

            {tracksLoading ? (
              <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-14 gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm">Loading tracks…</span>
              </div>
            ) : tracks.length === 0 ? (
              <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-14">
                <p className="text-sm text-muted-foreground">No tracks available.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {tracks.slice(0, 10).map((track, i) => {
                  const albumArt = track.album.images[0]?.url
                  const isPlaying = playingId === track.id
                  const hasPreview = !!track.preview_url

                  const spotifyUrl = track.external_urls?.spotify ?? `https://open.spotify.com/track/${track.id}`
                  const Row = hasPreview ? "div" : "a"
                  const rowProps = hasPreview
                    ? { onClick: () => handlePlay(track) }
                    : { href: spotifyUrl, target: "_blank", rel: "noopener noreferrer" }

                  return (
                    <Row
                      key={track.id}
                      {...(rowProps as any)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 transition-colors",
                        i < tracks.slice(0, 10).length - 1 && "border-b border-border",
                        "cursor-pointer hover:bg-muted/50",
                        isPlaying && "bg-primary/5"
                      )}
                    >
                      <div className="w-6 shrink-0 text-center">
                        {isPlaying ? (
                          <Pause className="size-3.5 fill-current text-primary mx-auto" />
                        ) : (
                          <span className="text-xs text-muted-foreground">{i + 1}</span>
                        )}
                      </div>
                      <div
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
                          isPlaying
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted hover:bg-primary hover:text-primary-foreground"
                        )}
                      >
                        {isPlaying ? <Pause className="size-3 fill-current" /> : <Play className="size-3 fill-current" />}
                      </div>
                      {albumArt ? (
                        <img src={albumArt} alt={track.album.name} className="size-9 shrink-0 rounded-md object-cover" />
                      ) : (
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                          <Music2 className="size-4 text-muted-foreground/40" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-sm font-medium", isPlaying && "text-primary")}>{track.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{track.album.name}</p>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatDuration(track.duration_ms)}
                      </span>
                    </Row>
                  )
                })}
              </div>
            )}

            {/* Live dates (Ticketmaster). Hidden entirely when there's no API
                key — an empty section would read as "not touring", which is a
                claim we can't make without having asked. */}
            {eventsConfigured !== false && (eventsLoading || events.length > 0) && (
              <div className="mt-10">
                <div className="mb-4 flex items-baseline justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <CalendarDays className="size-4 text-primary" />
                    Live Dates
                  </h2>
                  <span className="text-xs text-muted-foreground">via Ticketmaster</span>
                </div>

                {eventsLoading ? (
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-14 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    <span className="text-sm">Looking for shows…</span>
                  </div>
                ) : (
                  <>
                  <div className="overflow-hidden rounded-2xl border border-border bg-card">
                    {visibleEvents.map((event, i) => (
                      <a
                        key={event.id}
                        href={event.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50",
                          i < visibleEvents.length - 1 && "border-b border-border"
                        )}
                      >
                        <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 leading-none">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                            {monthLabel(event.date)}
                          </span>
                          <span className="text-base font-bold tabular-nums">{dayLabel(event.date)}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{event.venue ?? event.name}</p>
                          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            {event.country && (
                              <img
                                src={`https://flagcdn.com/24x18/${event.country.toLowerCase()}.png`}
                                srcSet={`https://flagcdn.com/48x36/${event.country.toLowerCase()}.png 2x`}
                                alt=""
                                width={16}
                                height={12}
                                className="rounded-[2px] object-cover"
                              />
                            )}
                            <span className="truncate">
                              {[event.city, yearLabel(event.date)].filter(Boolean).join(" · ")}
                              {event.time ? ` · ${event.time.slice(0, 5)}` : ""}
                            </span>
                          </p>
                        </div>
                        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                          <Ticket className="size-3.5" />
                          Tickets
                        </span>
                      </a>
                    ))}
                  </div>
                  {events.length > EVENT_PREVIEW_COUNT && (
                    <button
                      onClick={() => setShowAllEvents((v) => !v)}
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                    >
                      {showAllEvents ? "Show less" : `Show all ${events.length} dates`}
                      <ChevronDown className={cn("size-4 transition-transform", showAllEvents && "rotate-180")} />
                    </button>
                  )}
                  </>
                )}
              </div>
            )}

          </motion.div>

          {/* Right column */}
          <div className="flex flex-col gap-8">

          {/* #1 on the Listening Map */}
          {topCountries.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Globe className="size-4 text-primary" />
                #1 Artist In
              </h2>
              <div className="flex flex-wrap gap-2">
                {topCountries.map((c) => (
                  <div
                    key={c.country}
                    title={`${c.listeners} listener${c.listeners === 1 ? "" : "s"}`}
                    className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm"
                  >
                    <img
                      src={`https://flagcdn.com/24x18/${c.country.toLowerCase()}.png`}
                      srcSet={`https://flagcdn.com/48x36/${c.country.toLowerCase()}.png 2x`}
                      alt=""
                      width={20}
                      height={15}
                      className="rounded-[2px] object-cover"
                    />
                    <span className="font-medium">{countries.getName(c.country, "en") ?? c.country}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Name That Song leaderboard */}
          {gameLeaders.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.18 }}
            >
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Gamepad2 className="size-4 text-primary" />
                Name That Song · Top Players
              </h2>
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {gameLeaders.slice(0, 10).map((l, i) => {
                  const isMe = l.user_id === currentUserId
                  const name = l.username ?? "Anonymous"
                  return (
                    <div
                      key={l.user_id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5",
                        i < Math.min(gameLeaders.length, 10) - 1 && "border-b border-border",
                        isMe && "bg-primary/10"
                      )}
                    >
                      <span className={cn("w-4 shrink-0 text-xs font-semibold tabular-nums", i === 0 ? "text-primary" : "text-muted-foreground")}>
                        {i + 1}
                      </span>
                      {l.avatar_url ? (
                        <img src={l.avatar_url} alt={name} className="size-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {name[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {name}
                        {isMe && <span className="ml-1 text-xs text-primary">(you)</span>}
                      </span>
                      <div className="flex shrink-0 items-center gap-1 text-xs text-primary">
                        <Trophy className="size-3" />
                        <span className="tabular-nums font-semibold">{l.points}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}

          {/* Loved songs */}
          {lovedSongs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <h2 className="mb-4 text-lg font-semibold">Loved by MusicFreak</h2>
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {lovedSongs.map((song, i) => (
                  <div
                    key={song.track_id}
                    className={cn("flex items-center gap-3 px-4 py-3", i < lovedSongs.length - 1 && "border-b border-border")}
                  >
                    <span className="w-4 shrink-0 text-xs text-muted-foreground">#{i + 1}</span>
                    {song.album_art ? (
                      <img src={song.album_art} alt={song.name} className="size-9 shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Music2 className="size-4 text-muted-foreground/40" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{song.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{song.artists}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-xs text-primary">
                      <Heart className="size-3 fill-current" />
                      <span className="tabular-nums">{song.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Fans */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
          >
            <h2 className="mb-4 text-lg font-semibold">Fans on MusicFreak</h2>
            {fans.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card py-10 text-center">
                <Heart className="size-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  Be the first to add {artist.name} to favorites!
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {fans.slice(0, 15).map((fan, i) => {
                  const name = fan.profiles?.username ?? "Anonymous"
                  const avatar = fan.profiles?.custom_avatar_url ?? fan.profiles?.avatar_url
                  return (
                    <div
                      key={fan.user_id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3",
                        i < fans.length - 1 && "border-b border-border"
                      )}
                    >
                      {avatar ? (
                        <img src={avatar} alt={name} className="size-8 rounded-full object-cover" />
                      ) : (
                        <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {name[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm font-medium">{name}</span>
                    </div>
                  )
                })}
                {fans.length > 15 && (
                  <div className="px-4 py-3 text-center text-xs text-muted-foreground">
                    +{fans.length - 15} more fans
                  </div>
                )}
              </div>
            )}
          </motion.div>

          </div>{/* end right column */}
        </div>
      </div>
    </div>
  )
}
