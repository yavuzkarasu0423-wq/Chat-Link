import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Friend {
  userId: string;
  displayName: string;
  photoUrl: string | null;
  country: string | null;
  status: "pending" | "accepted";
  direction: "incoming" | "outgoing";
}

export default function FriendsScreen() {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addId, setAddId] = useState("");
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<"friends" | "requests">("friends");

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/friends");
      if (res.ok) {
        const d = (await res.json()) as { friends: Friend[] };
        setFriends(d.friends ?? []);
      }
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const accepted = friends.filter((f) => f.status === "accepted");
  const incoming = friends.filter((f) => f.status === "pending" && f.direction === "incoming");
  const outgoing = friends.filter((f) => f.status === "pending" && f.direction === "outgoing");
  const pendingCount = incoming.length;

  const handleAccept = async (peerId: string) => {
    await apiFetch(`/api/friends/${peerId}/accept`, { method: "POST" });
    load();
  };

  const handleRemove = async (peerId: string, displayName: string) => {
    Alert.alert("Arkadaşlıktan Çıkar", `${displayName} ile arkadaşlığı bitirmek istiyor musun?`, [
      { text: "İptal", style: "cancel" },
      { text: "Evet", style: "destructive", onPress: async () => { await apiFetch(`/api/friends/${peerId}`, { method: "DELETE" }); load(); } },
    ]);
  };

  const handleAdd = async () => {
    if (!addId.trim()) return;
    setAdding(true);
    try {
      const res = await apiFetch("/api/friends", { method: "POST", body: JSON.stringify({ peerId: addId.trim() }) });
      if (res.ok) {
        setAddId("");
        load();
        Alert.alert("Gönderildi", "Arkadaşlık isteği gönderildi.");
      } else {
        const d = (await res.json()) as { error?: string };
        Alert.alert("Hata", d.error ?? "İstek gönderilemedi.");
      }
    } catch {
      Alert.alert("Hata", "Bağlantı hatası.");
    } finally {
      setAdding(false);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const renderFriend = ({ item }: { item: Friend }) => {
    const initial = item.displayName.charAt(0).toUpperCase();
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardLeft}>
          {item.photoUrl ? (
            <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}
          <View style={styles.cardInfo}>
            <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>{item.displayName}</Text>
            {item.country && <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{item.country}</Text>}
          </View>
        </View>
        <View style={styles.cardActions}>
          <Pressable
            onPress={() => router.push({ pathname: "/dm/[userId]", params: { userId: item.userId } })}
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          >
            <Feather name="message-circle" size={16} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => handleRemove(item.userId, item.displayName)}
            style={[styles.actionBtn, { backgroundColor: "#fef2f2" }]}
          >
            <Feather name="user-x" size={16} color="#ef4444" />
          </Pressable>
        </View>
      </View>
    );
  };

  const renderRequest = ({ item }: { item: Friend }) => {
    const initial = item.displayName.charAt(0).toUpperCase();
    const isIncoming = item.direction === "incoming";
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardLeft}>
          {item.photoUrl ? (
            <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: isIncoming ? "#6366f1" : colors.muted }]}>
              <Text style={[styles.avatarInitial, { color: isIncoming ? "#fff" : colors.mutedForeground }]}>{initial}</Text>
            </View>
          )}
          <View style={styles.cardInfo}>
            <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>{item.displayName}</Text>
            <Text style={[styles.cardSub, { color: isIncoming ? "#6366f1" : colors.mutedForeground }]}>
              {isIncoming ? "Sana istek gönderdi" : "İstek gönderildi"}
            </Text>
          </View>
        </View>
        {isIncoming ? (
          <View style={styles.cardActions}>
            <Pressable onPress={() => handleAccept(item.userId)} style={[styles.actionBtn, { backgroundColor: "#f0fdf4" }]}>
              <Feather name="check" size={16} color="#16a34a" />
            </Pressable>
            <Pressable onPress={() => handleRemove(item.userId, item.displayName)} style={[styles.actionBtn, { backgroundColor: "#fef2f2" }]}>
              <Feather name="x" size={16} color="#ef4444" />
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => handleRemove(item.userId, item.displayName)} style={[styles.actionBtn, { backgroundColor: "#fef2f2" }]}>
            <Feather name="x" size={16} color="#ef4444" />
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={styles.headerTitle}>Arkadaşlar</Text>
        <View style={styles.tabs}>
          <Pressable onPress={() => setTab("friends")} style={[styles.tabBtn, tab === "friends" && styles.tabBtnActive]}>
            <Text style={[styles.tabText, tab === "friends" && styles.tabTextActive]}>Arkadaşlar ({accepted.length})</Text>
          </Pressable>
          <Pressable onPress={() => setTab("requests")} style={[styles.tabBtn, tab === "requests" && styles.tabBtnActive]}>
            <Text style={[styles.tabText, tab === "requests" && styles.tabTextActive]}>
              İstekler {pendingCount > 0 ? `(${pendingCount})` : ""}
            </Text>
          </Pressable>
        </View>
      </View>

      {tab === "friends" && (
        <View style={styles.addRow}>
          <TextInput
            style={[styles.addInput, { backgroundColor: colors.muted, color: colors.foreground }]}
            value={addId}
            onChangeText={setAddId}
            placeholder="Kullanıcı ID ile ekle..."
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
          />
          <Pressable
            onPress={handleAdd}
            disabled={!addId.trim() || adding}
            style={[styles.addBtn, { backgroundColor: colors.primary, opacity: addId.trim() ? 1 : 0.4 }]}
          >
            {adding ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="user-plus" size={18} color="#fff" />}
          </Pressable>
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={tab === "friends" ? accepted : [...incoming, ...outgoing]}
          keyExtractor={(item) => item.userId}
          renderItem={tab === "friends" ? renderFriend : renderRequest}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 90 }]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name={tab === "friends" ? "users" : "bell"} size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {tab === "friends" ? "Henüz arkadaşın yok." : "Bekleyen istek yok."}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: "#052e16", paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff", marginBottom: 12 },
  tabs: { flexDirection: "row", gap: 8 },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)" },
  tabBtnActive: { backgroundColor: "#4ade80" },
  tabText: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.7)" },
  tabTextActive: { color: "#052e16" },
  addRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  addInput: { flex: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  addBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 10 },
  card: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 16, padding: 14, borderWidth: 1 },
  cardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 18, fontWeight: "700", color: "#fff" },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: "600" },
  cardSub: { fontSize: 12, marginTop: 2 },
  cardActions: { flexDirection: "row", gap: 8 },
  actionBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14 },
});
