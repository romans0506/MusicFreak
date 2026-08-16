import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";

import { ingestRecentPlays } from "@/lib/scrobble";
import { getNowPlaying, type NowPlaying } from "@/lib/spotify";

// One poller for the whole app.
//
// Both the mini-player and the profile's Spotify panel want "what's playing
// right now". Polling it twice would double our calls against a rate-limited
// client_id for no benefit, so the fetch lives here and both consume it.
//
// 30s matches the web app's currently-playing cache window. We also refresh
// when the app comes back to the foreground, since an interval doesn't fire
// while the app is suspended and the first thing you see should be current.
//
// The scrobbler rides along on this tick rather than running its own timer —
// same reason. It self-throttles to 90s, so most ticks are a no-op.

const POLL_MS = 30_000;

const NowPlayingContext = createContext<NowPlaying | null>(null);

export function NowPlayingProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState<NowPlaying | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      getNowPlaying().then((n) => {
        if (!cancelled) setNow(n);
      });
      ingestRecentPlays();
    };

    refresh();
    const interval = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  return <NowPlayingContext value={now}>{children}</NowPlayingContext>;
}

/** `null` until the first fetch resolves; `{ playing: false }` when idle. */
export function useNowPlaying() {
  return use(NowPlayingContext);
}
