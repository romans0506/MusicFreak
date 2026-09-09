import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { COUNTRY_LIST, countryName, flagUrl } from "@/lib/countries";
import { pickAndUploadImage, saveProfile, type ProfileFields } from "@/lib/profile";
import { colors } from "@/theme/colors";

type Initial = {
  username: string;
  bio: string;
  /**
   * The CUSTOM avatar only — null means "no custom photo", not "no photo".
   * Seeding this with the resolved avatar would quietly promote the Spotify
   * picture into custom_avatar_url on the next save, and would make removing a
   * photo impossible to express.
   */
  avatarUrl: string | null;
  /** Spotify's picture, shown as the preview when there is no custom one. */
  fallbackAvatarUrl?: string | null;
  bannerUrl: string | null;
  country: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  userId: string;
  initial: Initial;
  onSaved: (data: Omit<Initial, "fallbackAvatarUrl">) => void;
};

export default function EditProfileSheet({
  visible,
  onClose,
  userId,
  initial,
  onSaved,
}: Props) {
  const [username, setUsername] = useState(initial.username);
  const [bio, setBio] = useState(initial.bio);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [bannerUrl, setBannerUrl] = useState(initial.bannerUrl);
  const [country, setCountry] = useState(initial.country);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countryOpen, setCountryOpen] = useState(false);

  const busy = saving || uploadingAvatar || uploadingBanner;
  // What the user sees. `avatarUrl` is the custom layer; when they remove it the
  // preview drops back to Spotify's picture, which is exactly what the profile
  // will show afterwards.
  const previewAvatar = avatarUrl ?? initial.fallbackAvatarUrl ?? null;

  async function pick(kind: "avatar" | "banner") {
    setError(null);
    const setUploading = kind === "avatar" ? setUploadingAvatar : setUploadingBanner;
    setUploading(true);
    try {
      const url = await pickAndUploadImage(userId, kind);
      if (url) {
        if (kind === "avatar") setAvatarUrl(url);
        else setBannerUrl(url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const fields: ProfileFields = {
      username,
      bio,
      custom_avatar_url: avatarUrl,
      banner_url: bannerUrl,
      country,
    };
    try {
      await saveProfile(userId, fields);
      onSaved({
        username: username.trim(),
        bio: bio.trim(),
        avatarUrl,
        bannerUrl,
        country,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={{ color: colors.mutedForeground, fontSize: 16 }}>Cancel</Text>
          </Pressable>
          <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "700" }}>
            Edit Profile
          </Text>
          <Pressable onPress={handleSave} disabled={busy} hitSlop={10}>
            {saving ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text
                style={{
                  color: busy ? colors.mutedForeground : colors.primary,
                  fontSize: 16,
                  fontWeight: "700",
                }}>
                Save
              </Text>
            )}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Banner */}
          <Pressable onPress={() => pick("banner")} style={{ height: 150 }}>
            {bannerUrl ? (
              <Image source={bannerUrl} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            ) : (
              <LinearGradient
                colors={[colors.primary + "55", colors.primary + "11", "transparent"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ width: "100%", height: "100%" }}
              />
            )}
            <View
              style={{
                position: "absolute",
                inset: 0,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(0,0,0,0.32)",
              }}>
              {uploadingBanner ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <IconSymbol name="camera.fill" size={15} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>
                    {bannerUrl ? "Change banner" : "Add banner"}
                  </Text>
                </View>
              )}
            </View>

            {/* Nested Pressable: RN gives the touch to the inner one, so this
                removes rather than reopening the picker. */}
            {bannerUrl && !uploadingBanner ? (
              <Pressable
                onPress={() => setBannerUrl(null)}
                hitSlop={8}
                style={({ pressed }) => ({
                  position: "absolute",
                  top: 12,
                  right: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: pressed ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0.55)",
                })}>
                <IconSymbol name="xmark" size={12} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Remove</Text>
              </Pressable>
            ) : null}
          </Pressable>

          {/* Avatar overlapping the banner */}
          <View
            style={{
              paddingHorizontal: 20,
              flexDirection: "row",
              alignItems: "flex-end",
              gap: 14,
            }}>
            <Pressable
              onPress={() => pick("avatar")}
              style={{ marginTop: -40, width: 88, height: 88 }}>
              {previewAvatar ? (
                <Image
                  source={previewAvatar}
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: 999,
                    borderWidth: 4,
                    borderColor: colors.background,
                  }}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: 999,
                    borderWidth: 4,
                    borderColor: colors.background,
                    backgroundColor: colors.primarySoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                  <IconSymbol name="music.note" size={28} color={colors.primary} />
                </View>
              )}
              <View
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 2,
                  borderColor: colors.background,
                }}>
                {uploadingAvatar ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <IconSymbol name="camera.fill" size={13} color="#fff" />
                )}
              </View>
            </Pressable>

            {/* Only offered when there IS a custom photo — removing it reverts to
                the Spotify picture, which the preview shows immediately. */}
            {avatarUrl && !uploadingAvatar ? (
              <Pressable
                onPress={() => setAvatarUrl(null)}
                hitSlop={8}
                style={({ pressed }) => ({ paddingBottom: 6, opacity: pressed ? 0.6 : 1 })}>
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "600" }}>
                  Remove photo
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* Fields */}
          <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 18 }}>
            <Field label="Username">
              <TextInput
                value={username}
                onChangeText={setUsername}
                maxLength={30}
                placeholder="Your display name"
                placeholderTextColor={colors.mutedForeground}
                style={inputStyle}
              />
            </Field>

            <Field label="Bio">
              <TextInput
                value={bio}
                onChangeText={setBio}
                maxLength={140}
                placeholder="Hip-hop head · Vienna 🎧"
                placeholderTextColor={colors.mutedForeground}
                multiline
                style={[inputStyle, { minHeight: 80, textAlignVertical: "top" }]}
              />
              <Text
                style={{
                  color: colors.mutedForeground,
                  fontSize: 11,
                  textAlign: "right",
                  marginTop: 4,
                }}>
                {bio.length}/140
              </Text>
            </Field>

            <Field label="Country">
              <Pressable onPress={() => setCountryOpen(true)} style={inputStyle}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {country ? (
                    <Image
                      source={flagUrl(country)}
                      style={{ width: 22, height: 16, borderRadius: 2 }}
                      contentFit="cover"
                    />
                  ) : null}
                  <Text
                    style={{
                      color: country ? colors.foreground : colors.mutedForeground,
                      fontSize: 15,
                    }}>
                    {countryName(country) ?? "Not set"}
                  </Text>
                </View>
              </Pressable>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 4 }}>
                Places you on the Listening Map.
              </Text>
            </Field>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <IconSymbol name="lightbulb.fill" size={13} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                GIFs work for both avatar and banner.
              </Text>
            </View>

            {error ? (
              <View
                style={{
                  backgroundColor: "rgba(239,68,68,0.12)",
                  borderColor: "rgba(239,68,68,0.3)",
                  borderWidth: 1,
                  borderRadius: 12,
                  padding: 12,
                }}>
                <Text style={{ color: colors.red, fontSize: 13 }}>{error}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <CountryPicker
        visible={countryOpen}
        selected={country}
        onClose={() => setCountryOpen(false)}
        onSelect={(code) => {
          setCountry(code);
          setCountryOpen(false);
        }}
      />
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const inputStyle = {
  backgroundColor: colors.card,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 12,
  borderCurve: "continuous" as const,
  paddingHorizontal: 14,
  paddingVertical: 12,
  color: colors.foreground,
  fontSize: 15,
};

function CountryPicker({
  visible,
  selected,
  onClose,
  onSelect,
}: {
  visible: boolean;
  selected: string | null;
  onClose: () => void;
  onSelect: (code: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const data = useMemo(() => {
    const list = q
      ? COUNTRY_LIST.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
      : COUNTRY_LIST;
    return [{ code: "", name: "Not set" }, ...list];
  }, [q]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 12,
          }}>
          <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "700" }}>
            Select country
          </Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "600" }}>Done</Text>
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search…"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
            autoCorrect={false}
          />
        </View>
        <FlatList
          data={data}
          keyExtractor={(item) => item.code || "none"}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isSel = (item.code || null) === selected;
            return (
              <Pressable
                onPress={() => onSelect(item.code || null)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: 20,
                  paddingVertical: 13,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  backgroundColor: isSel ? colors.primarySoft : "transparent",
                }}>
                {item.code ? (
                  <Image
                    source={flagUrl(item.code)}
                    style={{ width: 24, height: 18, borderRadius: 2 }}
                    contentFit="cover"
                  />
                ) : (
                  <View style={{ width: 24 }} />
                )}
                <Text
                  style={{
                    flex: 1,
                    color: isSel ? colors.primary : colors.foreground,
                    fontSize: 15,
                    fontWeight: isSel ? "700" : "400",
                  }}>
                  {item.name}
                </Text>
                {isSel ? (
                  <IconSymbol name="checkmark" size={16} color={colors.primary} />
                ) : null}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}
