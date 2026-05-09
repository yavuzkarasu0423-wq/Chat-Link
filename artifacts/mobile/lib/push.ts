import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Cache key carries both the user id and token so logout/login swaps on the same
// device always re-bind the token to the new account on the server.
const STORAGE_KEY = "v1chat_push_token_v2";

interface CachedRegistration {
  userId: string;
  token: string;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureAndroidChannels() {
  if (Platform.OS !== "android") return;
  await Promise.all([
    Notifications.setNotificationChannelAsync("default", {
      name: "Genel",
      importance: Notifications.AndroidImportance.DEFAULT,
    }),
    Notifications.setNotificationChannelAsync("messages", {
      name: "Mesajlar",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    }),
    Notifications.setNotificationChannelAsync("friends", {
      name: "Arkadaşlar",
      importance: Notifications.AndroidImportance.HIGH,
    }),
    Notifications.setNotificationChannelAsync("gifts", {
      name: "Hediyeler",
      importance: Notifications.AndroidImportance.HIGH,
    }),
  ]);
}

/**
 * Request permission, fetch the Expo push token, and POST it to the API.
 * No-ops on the web platform and on simulators (Expo can't issue tokens there).
 */
export async function registerForPushNotifications(opts: {
  apiBase: string;
  sessionId: string;
  userId: string;
}): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (!Device.isDevice) return null;

  await ensureAndroidChannels();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") return null;

  let token: string;
  try {
    const projectId =
      (process.env["EXPO_PUBLIC_REPL_ID"] as string | undefined) ||
      undefined;
    const t = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    token = t.data;
  } catch {
    return null;
  }

  // Skip the network round-trip only when the same user already registered the
  // same token on this device. Different user → always re-register so the
  // server rebinds the token to the new account.
  let cached: CachedRegistration | null = null;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cached = raw ? (JSON.parse(raw) as CachedRegistration) : null;
  } catch {
    cached = null;
  }
  if (cached && cached.userId === opts.userId && cached.token === token) {
    return token;
  }

  try {
    await fetch(`${opts.apiBase}/api/push/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.sessionId}`,
      },
      body: JSON.stringify({ token, platform: Platform.OS }),
    });
    const next: CachedRegistration = { userId: opts.userId, token };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* swallow — will retry next time */
  }

  return token;
}

export async function unregisterPushNotifications(opts: {
  apiBase: string;
  sessionId: string;
}): Promise<void> {
  let cached: CachedRegistration | null = null;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cached = raw ? (JSON.parse(raw) as CachedRegistration) : null;
  } catch {
    cached = null;
  }
  if (!cached?.token) return;
  try {
    await fetch(`${opts.apiBase}/api/push/unregister`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.sessionId}`,
      },
      body: JSON.stringify({ token: cached.token }),
    });
  } catch {
    /* ignore */
  }
  await AsyncStorage.removeItem(STORAGE_KEY);
}
