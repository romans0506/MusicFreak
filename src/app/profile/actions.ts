"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

type ProfileInput = {
  username: string
  bio: string
  customAvatarUrl: string | null
  bannerUrl: string | null
  country: string | null
}

// These URLs are rendered in <img> tags across the app (nav, leaderboard,
// map) — accept only https URLs, never javascript:/data: or other schemes.
function sanitizeImageUrl(url: string | null): string | null {
  if (!url) return null
  const trimmed = url.trim().slice(0, 600)
  return /^https:\/\//.test(trimmed) ? trimmed : null
}

export async function updateProfile(data: ProfileInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "not_authenticated" }

  const username = data.username.trim().slice(0, 30)
  if (username.length < 2) return { error: "Username must be at least 2 characters" }

  // Store an uppercase ISO 3166-1 alpha-2 code (or null to clear).
  const rawCountry = data.country?.trim().toUpperCase() ?? ""
  const country = /^[A-Z]{2}$/.test(rawCountry) ? rawCountry : null

  const { error } = await supabase
    .from("profiles")
    .update({
      username,
      bio: data.bio.trim().slice(0, 140) || null,
      custom_avatar_url: sanitizeImageUrl(data.customAvatarUrl),
      banner_url: sanitizeImageUrl(data.bannerUrl),
      country,
    })
    .eq("id", user.id)

  if (error) return { error: error.message }

  revalidatePath("/profile")
  revalidatePath("/app/map")
  return { success: true }
}

