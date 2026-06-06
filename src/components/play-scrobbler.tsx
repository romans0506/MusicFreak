"use client"

import { useEffect } from "react"

/**
 * Headless: periodically asks the server to pull the user's latest Spotify
 * plays into our own play_history table. Mounted in the app layout.
 *
 * It polls on mount, on an interval, and whenever the tab regains focus — so
 * tracks you play (and skip) while the app stays open get captured without a
 * full reload. The server throttles to one real Spotify poll per 30s per user
 * and dedups on (user_id, played_at), so extra fires are cheap and harmless.
 */
const POLL_INTERVAL = 60_000 // 60s (server throttles to 30s anyway)

export default function PlayScrobbler() {
  useEffect(() => {
    let active = true
    const poll = () => {
      if (active) fetch("/api/spotify/ingest-plays", { method: "POST" }).catch(() => {})
    }

    poll() // initial pull
    const interval = setInterval(poll, POLL_INTERVAL)
    const onVisible = () => {
      if (document.visibilityState === "visible") poll()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", poll)

    return () => {
      active = false
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", poll)
    }
  }, [])

  return null
}
