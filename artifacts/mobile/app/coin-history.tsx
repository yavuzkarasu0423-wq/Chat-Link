import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Transaction {
  id: number;
  amount: number;
  reason: string;
  createdAt: string;
}

export default function CoinHistoryScreen() {
  const { apiFetch } = useApi();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingDaily, setClaimingDaily] = useState(false);

  const load = useCallback(async () => {
    try {
      const [histRes, balRes] = await Promise.all([
        apiFetch("/api/coins/history"),
        apiFetch("/api/coins/me"),
      ]);
      if (histRes.ok) {
        const d = (await histRes.json()) as { transactions: Transaction[] };
        setTransactions(d.transactions ?? []);
      }
      if (balRes.ok) {
        const d = (await balRes.json()) as { balance: number };
        setBalance(d.balance ?? 0);
      }
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const claimDaily = async () => {
    setClaimingDaily(true);
    try {
      const res = await apiFetch("/api/coins/daily", { method: "POST" });
      if (res.ok) {
        Alert.alert("Tebrikler!", "50 günlük bonus coinin hesabına eklendi! 🎉");
        load();
      } else {
        Alert.alert("Zaten Alındı", "Günlük bonusu zaten aldın. Yarın tekrar gel!");
      }
    } catch {
      Alert.alert("Hata", "Bağlantı hatası.");
    } finally {
      setClaimingDaily(false);
    }
  };

  const renderItem = ({ item }: { item: Transaction }) => {
    const isPositive = item.amount > 0;
    const date = new Date(item.createdAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    return (
      <View style={[styles.txRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.txIcon, { backgroundColor: isPositive ? "#f0fdf4" : "#fef2f2" }]}>
          <Feather name={isPositive ? "arrow-down-left" : "arrow-up-right"} size={18} color={isPositive ? "#16a34a" : "#ef4444"} />
        </View>
        <View style={styles.txInfo}>
          <Text style={[styles.txReason, { color: colors.foreground }]} numberOfLines={1}>{item.reason}</Text>
          <Text style={[styles.txDate, { color: colors.mutedForeground }]}>{date}</Text>
        </View>
        <Text style={[styles.txAmount, { color: isPositive ? "#16a34a" : "#ef4444" }]}>
          {isPositive ? "+" : ""}{item.amount}
        </Text>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Coin Geçmişi</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.balanceCard, { backgroundColor: "#f0fdf4" }]}>
        <Feather name="award" size={28} color="#f59e0b" />
        <Text style={styles.balanceNum}>{balance}</Text>
        <Text style={styles.balanceLabel}>Mevcut Coin</Text>
        <Pressable onPress={claimDaily} disabled={claimingDaily} style={[styles.dailyBtn, { backgroundColor: "#16a34a" }]}>
          {claimingDaily ? <ActivityIndicator color="#fff" size="small" /> : (
            <>
              <Feather name="gift" size={16} color="#fff" />
              <Text style={styles.dailyBtnText}>Günlük +50 Al</Text>
            </>
          )}
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(t) => String(t.id)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="award" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Henüz işlem yok.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: "#052e16", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  balanceCard: { margin: 16, borderRadius: 20, padding: 24, alignItems: "center", gap: 6 },
  balanceNum: { fontSize: 42, fontWeight: "900", color: "#111827" },
  balanceLabel: { fontSize: 14, color: "#6b7280" },
  dailyBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginTop: 8 },
  dailyBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  txRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  txInfo: { flex: 1 },
  txReason: { fontSize: 14, fontWeight: "500" },
  txDate: { fontSize: 12, marginTop: 2 },
  txAmount: { fontSize: 16, fontWeight: "700" },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14 },
});
