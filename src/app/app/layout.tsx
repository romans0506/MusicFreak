import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import AppNav from "@/components/app-nav"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/")

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, custom_avatar_url")
    .eq("id", user.id)
    .single()

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-60 -top-20 size-[700px] rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute -right-60 bottom-40 size-[500px] rounded-full bg-primary/5 blur-3xl" />
      </div>
      <AppNav user={user} profile={profile ?? null} />
      <main className="relative mx-auto max-w-6xl px-6 pt-24 pb-16">
        {children}
      </main>
    </div>
  )
}
