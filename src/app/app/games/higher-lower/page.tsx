import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import HigherLowerGame from "@/components/higher-lower-game"

export default async function HigherLowerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/")

  return (
    <div className="mx-auto max-w-2xl">
      <HigherLowerGame />
    </div>
  )
}
