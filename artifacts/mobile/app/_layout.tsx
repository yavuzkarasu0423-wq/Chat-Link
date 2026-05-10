import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

WebBrowser.maybeCompleteAuthSession();

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { registerForPushNotifications, unregisterPushNotifications } from "@/lib/push";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function PushRegistrar() {
  const { user, sessionId } = useAuth();
  useEffect(() => {
    const apiBase = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}`;
    if (user && sessionId) {
      registerForPushNotifications({ apiBase, sessionId, userId: user.id }).catch(() => {});
    } else if (sessionId) {
      // Session present but user cleared (logging out) → drop server binding
      unregisterPushNotifications({ apiBase, sessionId }).catch(() => {});
    }
  }, [user, sessionId]);
  return null;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="dm/[userId]" options={{ headerShown: false }} />
      <Stack.Screen name="profile-edit" options={{ headerShown: false }} />
      <Stack.Screen name="coin-history" options={{ headerShown: false }} />
      <Stack.Screen name="videochat" options={{ headerShown: false }} />
      <Stack.Screen name="leaderboard" options={{ headerShown: false }} />
      <Stack.Screen name="vip" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <PushRegistrar />
            <GestureHandlerRootView>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
