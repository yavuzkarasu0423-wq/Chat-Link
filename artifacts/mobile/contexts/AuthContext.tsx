import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Platform } from "react-native";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
const SESSION_KEY = "v1chat_session_id";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  sessionId: string | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  sessionId: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async (sid: string): Promise<AuthUser | null> => {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/user`, {
        headers: { Authorization: `Bearer ${sid}` },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { user: AuthUser | null };
      return data.user;
    } catch {
      return null;
    }
  }, []);

  const storeSession = useCallback(async (sid: string) => {
    await AsyncStorage.setItem(SESSION_KEY, sid);
    setSessionId(sid);
    const u = await fetchUser(sid);
    setUser(u);
  }, [fetchUser]);

  useEffect(() => {
    (async () => {
      const sid = await AsyncStorage.getItem(SESSION_KEY);
      if (sid) {
        const u = await fetchUser(sid);
        if (u) {
          setSessionId(sid);
          setUser(u);
        } else {
          await AsyncStorage.removeItem(SESSION_KEY);
        }
      }
      setIsLoading(false);
    })();
  }, [fetchUser]);

  // Web: ?sid= URL param'ından oturum oku (redirect-based login sonrası)
  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const sid = params.get("sid");
      if (sid) {
        window.history.replaceState({}, "", window.location.pathname);
        storeSession(sid).catch(() => {});
      }
    }
  }, [storeSession]);

  const handleDeepLink = useCallback((url: string) => {
    const parsed = Linking.parse(url);
    const sid = parsed.queryParams?.sid as string | undefined;
    if (sid) {
      storeSession(sid).catch(() => {});
    }
  }, [storeSession]);

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });
    const sub = Linking.addEventListener("url", ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, [handleDeepLink]);

  const login = useCallback(async () => {
    const loginUrl = `${BASE_URL}/api/login?mobile=1`;

    if (Platform.OS === "web" && typeof window !== "undefined") {
      // Web'de redirect-based akış: giriş sonrası bu sayfaya ?sid= ile dön
      const webRedirect = window.location.origin + window.location.pathname;
      window.location.href = `${loginUrl}&webRedirect=${encodeURIComponent(webRedirect)}`;
      return;
    }

    // Native: openAuthSessionAsync + deep link
    const result = await WebBrowser.openAuthSessionAsync(loginUrl, "mobile://auth");
    if (result.type === "success" && result.url) {
      handleDeepLink(result.url);
    }
  }, [handleDeepLink]);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    setUser(null);
    setSessionId(null);
    if (sessionId) {
      fetch(`${BASE_URL}/api/logout`, {
        headers: { Authorization: `Bearer ${sessionId}` },
      }).catch(() => {});
    }
  }, [sessionId]);

  return (
    <AuthContext.Provider value={{ user, sessionId, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
