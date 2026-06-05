"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

type ProfileInput = {
  username: string
  bio: string
  customAvatarUrl: string | null
  bannerUrl: string | null
}

export async function updateProfile(data: ProfileInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "not_authenticated" }

  const username = data.username.trim().slice(0, 30)
  if (username.length < 2) return { error: "Username must be at least 2 characters" }

  const { error } = await supabase
    .from("profiles")
    .update({
      username,
      bio: data.bio.trim().slice(0, 140) || null,
      custom_avatar_url: data.customAvatarUrl,
      banner_url: data.bannerUrl,
    })
    .eq("id", user.id)

  if (error) return { error: error.message }

  revalidatePath("/profile")
  return { success: true }
}
