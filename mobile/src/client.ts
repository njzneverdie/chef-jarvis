import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import type { Row } from "./types";
const secureStorage = {
  getItem: async (key: string) => {
    const count = await SecureStore.getItemAsync(key + ".count");
    if (!count) return null;
    const chunks = await Promise.all(
      Array.from({ length: Number(count) }, (_, i) =>
        SecureStore.getItemAsync(key + "." + i),
      ),
    );
    return chunks.every((v) => v !== null) ? chunks.join("") : null;
  },
  setItem: async (key: string, value: string) => {
    const old = Number((await SecureStore.getItemAsync(key + ".count")) || 0);
    const parts = value.match(/[\s\S]{1,1500}/g) || [];
    for (let i = 0; i < parts.length; i++)
      await SecureStore.setItemAsync(key + "." + i, parts[i], {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    await SecureStore.setItemAsync(key + ".count", String(parts.length));
    for (let i = parts.length; i < old; i++)
      await SecureStore.deleteItemAsync(key + "." + i);
  },
  removeItem: async (key: string) => {
    const count = Number((await SecureStore.getItemAsync(key + ".count")) || 0);
    await SecureStore.deleteItemAsync(key + ".count");
    await Promise.all(
      Array.from({ length: count }, (_, i) =>
        SecureStore.deleteItemAsync(key + "." + i),
      ),
    );
  },
};
export const backendURL = "https://mylcykwmwlnjlclodmuo.supabase.co";
const publishableKey = "sb_publishable_DCmfrANKHYSrKx18V-fJhg_TEMfoyb1";
export const supabase = createClient(backendURL, publishableKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});
export const emailAuth = createClient(backendURL, publishableKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
    flowType: "implicit",
  },
});
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
export const callbackURL = Linking.createURL("auth/callback");
export function requireOK<T extends { error: any }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}
export async function edge(name: string, body: Row, timeoutMs = 55000) {
  const {
    data: { session },
  } = requireOK(await supabase.auth.getSession());
  if (!session) throw new Error("Please sign in again. 請重新登入。");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${backendURL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || `Service unavailable (${response.status})`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}
export async function handleAuthLink(url: string) {
  const parsed = new URL(url);
  const code = parsed.searchParams.get("code");
  if (code) requireOK(await supabase.auth.exchangeCodeForSession(code));
  // PKCE recovery uses the same exchange and emits PASSWORD_RECOVERY.
}
