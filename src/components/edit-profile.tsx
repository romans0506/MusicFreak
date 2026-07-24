"use client"

import { useState, useRef, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Camera, ImagePlus, Loader2, Music2 } from "lucide-react"
import countries from "i18n-iso-countries"
import enLocale from "i18n-iso-countries/langs/en.json"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { updateProfile } from "@/app/profile/actions"

countries.registerLocale(enLocale)

type Props = {
  open: boolean
  onClose: () => void
  userId: string
  initial: {
    username: string
    bio: string
    avatarUrl: string | null
    bannerUrl: string | null
    country: string | null
  }
  onSaved: (data: { username: string; bio: string; avatarUrl: string | null; bannerUrl: string | null; country: string | null }) => void
}

const MAX_BYTES = 5 * 1024 * 1024 // 5MB

export default function EditProfile({ open, onClose, userId, initial, onSaved }: Props) {
  const [username, setUsername] = useState(initial.username)
  const [bio, setBio] = useState(initial.bio)
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl)
  const [bannerUrl, setBannerUrl] = useState(initial.bannerUrl)
  const [country, setCountry] = useState(initial.country ?? "")

  const countryOptions = useMemo(() => {
    const names = countries.getNames("en", { select: "official" }) as Record<string, string>
    return Object.entries(names)
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [])
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const avatarInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File, kind: "avatar" | "banner") {
    setError(null)
    if (file.size > MAX_BYTES) {
      setError("File too large (max 5MB)")
      return
    }
    if (!file.type.startsWith("image/")) {
      setError("Only images and GIFs are allowed")
      return
    }

    const setUploading = kind === "avatar" ? setUploadingAvatar : setUploadingBanner
    setUploading(true)

    const supabase = createClient()
    const ext = file.name.split(".").pop() || "png"
    const path = `${userId}/${kind}-${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from("profile-media")
      .upload(path, file, { cacheControl: "3600", upsert: true })

    if (upErr) {
      setError(upErr.message)
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from("profile-media").getPublicUrl(path)
    if (kind === "avatar") setAvatarUrl(data.publicUrl)
    else setBannerUrl(data.publicUrl)
    setUploading(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const res = await updateProfile({ username, bio, customAvatarUrl: avatarUrl, bannerUrl, country: country || null })
    setSaving(false)
    if (res.error) {
      setError(res.error)
      return
    }
    onSaved({ username: username.trim(), bio: bio.trim(), avatarUrl, bannerUrl, country: country || null })
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold">Edit Profile</h2>
              <button onClick={onClose} className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <X className="size-5" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto">
              {/* Banner */}
              <div className="relative h-32 bg-muted">
                {bannerUrl ? (
                  <img src={bannerUrl} alt="" className="size-full object-cover" />
                ) : (
                  <div className="size-full bg-gradient-to-br from-primary/30 to-primary/5" />
                )}
                <button
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={uploadingBanner}
                  className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 text-sm font-medium text-white opacity-0 transition-opacity hover:opacity-100"
                >
                  {uploadingBanner ? <Loader2 className="size-5 animate-spin" /> : <><ImagePlus className="size-5" /> Change banner</>}
                </button>
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*,image/gif"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], "banner")}
                />
              </div>

              {/* Avatar */}
              <div className="px-5">
                <div className="relative -mt-10 mb-4 w-fit">
                  <div className="size-20 overflow-hidden rounded-full ring-4 ring-card">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center bg-primary/20">
                        <Music2 className="size-7 text-primary" />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="absolute bottom-0 right-0 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-110"
                  >
                    {uploadingAvatar ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*,image/gif"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], "avatar")}
                  />
                </div>
              </div>

              {/* Fields */}
              <div className="space-y-4 px-5 pb-5">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Username</label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    maxLength={30}
                    placeholder="Your display name"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={140}
                    rows={3}
                    placeholder="Hip-hop head · Vienna 🎧"
                    className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
                  />
                  <p className="mt-1 text-right text-xs text-muted-foreground">{bio.length}/140</p>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">Country</label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
                  >
                    <option value="">Not set</option>
                    {countryOptions.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">Places you on the Listening Map.</p>
                </div>

                <p className="text-xs text-muted-foreground">
                  💡 GIFs work for both avatar and banner — animated images are supported.
                </p>

                {error && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                    {error}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">
              <button
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || uploadingAvatar || uploadingBanner}
                className={cn(
                  "flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-[background-color,scale] duration-150 ease-out hover:bg-primary/80 active:not-disabled:scale-[0.96]",
                  (saving || uploadingAvatar || uploadingBanner) && "opacity-60"
                )}
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                Save
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
