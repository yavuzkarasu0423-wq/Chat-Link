import { useAuth } from "@/contexts/AuthContext";
import { useCallback } from "react";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

export function useApi() {
  const { sessionId } = useAuth();

  const apiFetch = useCallback(
    async (path: string, options: RequestInit = {}): Promise<Response> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
      };
      if (sessionId) headers["Authorization"] = `Bearer ${sessionId}`;
      return fetch(`${BASE_URL}${path}`, { ...options, headers });
    },
    [sessionId],
  );

  return { apiFetch };
}
