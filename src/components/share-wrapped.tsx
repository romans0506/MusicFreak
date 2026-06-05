"use client"

import { useState } from "react"
import { Share2, Loader2 } from "lucide-react"

export default function ShareWrapped() {
  const [loading, setLoading] = useState(false)

  async function share() {
    setLoading(true)
    try {
      const res = await fetch("/api/wrapped")
      if (!res.ok) throw new Error("failed")
      const blob = await res.blob()
      const file = new File([blob], "musicfreak-wrapped.png", { type: "image/png" })

      // Native share sheet (mobile → Stories etc.), if the browser supports files.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My MusicFreak Wrapped" })
      } else {
        // Fallback: download the PNG.
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "musicfreak-wrapped.png"
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch {
      // Last resort: open the image in a new tab.
      window.open("/api/wrapped", "_blank")
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={share}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-60"
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
      Share Wrapped
    </button>
  )
}
