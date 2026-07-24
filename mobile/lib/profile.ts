import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";

import { supabase } from "@/lib/supabase";

export type ProfileFields = {
  username: string;
  bio: string;
  custom_avatar_url: string | null;
  banner_url: string | null;
  country: string | null;
};

const MAX_BYTES = 5 * 1024 * 1024; // 5MB, matches the web uploader

// Picks an image from the library and uploads it to the shared `profile-media`
// bucket at `{userId}/{kind}-{ts}.{ext}` (same scheme as the web app), then
// returns its public URL. Returns null if the user cancels.
//
// We read the asset as base64 (via the picker) and decode to an ArrayBuffer —
// the reliable React Native path, since fetch(uri).blob() is flaky on RN.
export async function pickAndUploadImage(
  userId: string,
  kind: "avatar" | "banner",
): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Photo library permission is required");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: kind === "banner" ? [16, 9] : [1, 1],
    quality: 0.85,
    base64: true,
  });

  if (result.canceled || !result.assets?.[0]?.base64) return null;
  const asset = result.assets[0];
  const base64 = asset.base64!;

  // base64 length ≈ 4/3 of byte size — cheap size guard before upload.
  if ((base64.length * 3) / 4 > MAX_BYTES) {
    throw new Error("Image too large (max 5MB)");
  }

  const contentType = asset.mimeType ?? "image/jpeg";
  const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("profile-media")
    .upload(path, decode(base64), { contentType, upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from("profile-media").getPublicUrl(path);
  return data.publicUrl;
}

export async function saveProfile(userId: string, fields: ProfileFields) {
  const { error } = await supabase
    .from("profiles")
    .update({
      username: fields.username.trim() || null,
      bio: fields.bio.trim() || null,
      custom_avatar_url: fields.custom_avatar_url,
      banner_url: fields.banner_url,
      country: fields.country,
    })
    .eq("id", userId);
  if (error) throw error;
}
