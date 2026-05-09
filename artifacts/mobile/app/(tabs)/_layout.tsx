import { Redirect } from "expo-router";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, View, ActivityIndicator, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

function CountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <View style={badgeStyles.badge}>
      <Text style={badgeStyles.text}>{count > 9 ? "9+" : count}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: "#ef4444",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  text: { fontSize: 10, fontWeight: "700", color: "#fff" },
});

export default function TabLayout() {
  const { user, isLoading } = useAuth();
  const { apiFetch } = useApi();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isIOS = Platform.OS === "ios";
  const [unreadDMs, setUnreadDMs] = useState(0);
  const [pendingFriends, setPendingFriends] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchBadges = async () => {
      try {
        const [dmRes, friendRes] = await Promise.all([
          apiFetch("/api/dms"),
          apiFetch("/api/friends"),
        ]);
        if (dmRes.ok) {
          const d = (await dmRes.json()) as { threads: { unread?: number }[] };
          const total = (d.threads ?? []).reduce((sum, t) => sum + (t.unread ?? 0), 0);
          setUnreadDMs(total);
        }
        if (friendRes.ok) {
          const d = (await friendRes.json()) as { friends: { status: string; direction: string }[] };
          const pending = (d.friends ?? []).filter((f) => f.status === "pending" && f.direction === "incoming").length;
          setPendingFriends(pending);
        }
      } catch {}
    };
    fetchBadges();
    const t = setInterval(fetchBadges, 15000);
    return () => clearInterval(t);
  }, [user, apiFetch]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          height: Platform.OS === "web" ? 84 : 60 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={95} tint="light" style={StyleSheet.absoluteFill} />
          ) : Platform.OS === "web" ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Ana Sayfa",
          tabBarIcon: ({ color, size }) => <Feather name="video" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Mesajlar",
          tabBarIcon: ({ color, size }) => (
            <View>
              <Feather name="message-circle" size={size} color={color} />
              <CountBadge count={unreadDMs} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "Arkadaşlar",
          tabBarIcon: ({ color, size }) => (
            <View>
              <Feather name="users" size={size} color={color} />
              <CountBadge count={pendingFriends} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
