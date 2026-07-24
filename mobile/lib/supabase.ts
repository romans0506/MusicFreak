import "react-native-url-polyfill/auto";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Same Supabase project as the web app. Session is persisted in AsyncStorage
// and auto-refreshed. detectSessionInUrl is false (no browser URL on native);
// the OAuth code is exchanged manually in lib/auth.tsx.
//
// On web, AsyncStorage touches `window` at call time, which is undefined during
// static SSR render and crashes the whole dev server. We don't ship web — leave
// storage unset there so supabase falls back to its own browser default.
export const supabase = createClient(url, anonKey, {
  auth: {
    storage: Platform.OS === "web" ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});
