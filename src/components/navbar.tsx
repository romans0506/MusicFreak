"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Music2, LogOut } from "lucide-react"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import SignInButton from "@/components/sign-in-button"

export default function Navbar() {
  const [user, setUser] = useState<SupabaseUser | null | undefined>(undefined)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    setMounted(true)
    supabase.auth.getUser().then(({ data }) => setUser(data.user))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.refresh()
  }

  const displayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.email?.split("@")[0]

  const avatarUrl = user?.user_metadata?.avatar_url

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Music2 className="size-5 text-primary" />
          <span>MusicFreak</span>
        </Link>

        <div className="flex items-center gap-2">
          {!mounted ? null : user ? (
            <>
              <Link
                href="/profile"
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="size-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex size-6 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                    {displayName?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
                <span className="max-w-[120px] truncate">{displayName}</span>
              </Link>
              <Button variant="ghost" size="icon" onClick={signOut} title="Sign out">
                <LogOut className="size-4" />
              </Button>
            </>
          ) : (
            <SignInButton variant="outline" size="sm" />
          )}
        </div>

      </div>
    </nav>
  )
}
