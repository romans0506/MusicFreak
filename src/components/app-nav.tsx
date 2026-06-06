"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Music2, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

const TABS = [
  { label: "Games", href: "/app" },
  { label: "Leaderboard", href: "/app/leaderboard" },
  { label: "Artists", href: "/app/artists" },
  { label: "Map", href: "/app/map" },
  { label: "Stats", href: "/app/stats" },
]

type Profile = { username: string | null; custom_avatar_url: string | null } | null

export default function AppNav({ user, profile }: { user: User; profile?: Profile }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const displayName =
    profile?.username ??
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email?.split("@")[0] ??
    "You"

  const avatarUrl = profile?.custom_avatar_url ?? user.user_metadata?.avatar_url

  async function signOut() {
    await supabase.auth.signOut()
    router.push("/")
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">

        {/* Logo */}
        <Link href="/app" className="flex items-center gap-2 text-base font-bold tracking-tight">
          <Music2 className="size-5 text-primary" />
          <span>MusicFreak</span>
        </Link>

        {/* Tab pills */}
        <nav className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/60 p-1">
          {TABS.map((tab) => {
            const isActive =
              tab.href === "/app" ? pathname === "/app" : pathname.startsWith(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>

        {/* Profile */}
        <div className="flex items-center gap-2">
          <Link
            href="/profile"
            className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="size-7 rounded-full object-cover ring-2 ring-primary/30"
              />
            ) : (
              <div className="flex size-7 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                {displayName[0]?.toUpperCase()}
              </div>
            )}
            <span className="hidden max-w-[100px] truncate sm:block">{displayName}</span>
          </Link>
          <button
            onClick={signOut}
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>

      </div>
    </header>
  )
}
