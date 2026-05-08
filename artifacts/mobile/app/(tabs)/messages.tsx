import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Thread {
  userId: string;
  displayName: string;
  photoUrl: string | null;
  lastMessage: string;
  lastAt: string;
  unread: number;
}

export default function MessagesScreen() {
  const { apiFetch } = useApi();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/dms");
      if (res.ok) {
        const d = (await res.json()) as { threads: Thread[] };
        setThreads(d.threads ?? []);
      }
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const renderItem = ({ item }: { item: Thread }) => {
    const initial = (item.displayName ?? "?").charAt(0).toUpperCase();
    const time = item.lastAt
      ? new Date(item.lastAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
      : "";

    return (
      <Pressable
        onPress={() => router.push(`/dm/${item.userId}` as `/${string}`)}
        style={({ pressed }) => [styles.thread, pressed && { opacity: 0.7, backgroundColor: "#f9fafb" }]}
      >
        <View style={styles.avatarWrap}>
          {item.photoUrl ? (
            <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}
        </View>
        <View style={styles.threadInfo}>
          <View style={styles.threadTop}>
            <Text style={[styles.threadName, item.unread > 0 && { fontWeight: "700" }]} numberOfLines={1}>
              {item.displayName}
            </Text>
            <Text style={styles.threadTime}>{time}</Text>
          </View>
          <View style={styles.threadBottom}>
            <Text style={[styles.threadLast, item.unread > 0 && { color: "#111827", fontWeight: "600" }]} numberOfLines={1}>
              {item.lastMessage || "Henüz mesaj yok"}
            </Text>
            {item.unread > 0 && (
              <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.unreadText}>{item.unread > 9 ? "9+" : item.unread}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={styles.headerTitle}>Mesajlar</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(t) => t.userId}
          renderItem={renderItem}
          scrollEnabled={!!threads.length}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={colors.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.border }]} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="message-circle" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Henüz mesaj yok</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Görüntülü sohbet yapıp arkadaş edindikten sonra mesajlaşabilirsiniz.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  headerTitle: { fontSize: 28, fontWeight: "800", color: "#111827" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  thread: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  avatarWrap: {},
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 20, fontWeight: "700" },
  threadInfo: { flex: 1 },
  threadTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  threadName: { fontSize: 16, color: "#111827", fontWeight: "500", flex: 1, marginRight: 8 },
  threadTime: { fontSize: 12, color: "#9ca3af" },
  threadBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  threadLast: { fontSize: 14, color: "#6b7280", flex: 1, marginRight: 8 },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  unreadText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  sep: { height: 1, marginLeft: 86 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, marginTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
});
