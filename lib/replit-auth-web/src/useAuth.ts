import { useState, useEffect, useCallback } from "react";

export interface AuthUser {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
}

const BASE = "";

export function useAuth(): AuthState & { login: () => void; logout: () => void } {
  const [state, setState] = useState<AuthState>({ user: null, isLoading: true });

  useEffect(() => {
    fetch(`${BASE}/api/auth/user`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) return null;
        return r.json() as Promise<{ user: AuthUser | null }>;
      })
      .then((data) => setState({ user: data?.user ?? null, isLoading: false }))
      .catch(() => setState({ user: null, isLoading: false }));
  }, []);

  const login = useCallback(() => {
    const returnTo = BASE || "/";
    window.location.href = `${BASE}/api/login?returnTo=${encodeURIComponent(returnTo)}`;
  }, []);

  const logout = useCallback(() => {
    window.location.href = `${BASE}/api/logout`;
  }, []);

  return { ...state, login, logout };
}
