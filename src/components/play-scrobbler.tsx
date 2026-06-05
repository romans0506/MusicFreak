"use client"

import { useEffect } from "react"

/**
 * Headless: on mount, asks the server to pull the user's latest Spotify plays
 * into our own play_history table. Mounted in the app layout, so it runs once
 * per app session (the layout persists across client-side tab navigation).
 * The server side throttles + dedups, so extra fires are cheap and harmless.
 */
export default function PlayScrobbler() {
  useEffect(() => {
    fetch("/api/spotify/ingest-plays", { method: "POST" }).catch(() => {})
  }, [])

  return null
}
