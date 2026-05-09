import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
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

const COIN_PKGS = [
  { id: "pkg_450",   coins: 450,   price: 129,  icon: "🪙" },
  { id: "pkg_1800",  coins: 1800,  price: 479,  icon: "🪙" },
  { id: "pkg_3500",  coins: 3500,  price: 883,  icon: "🎁" },
  { id: "pkg_7000",  coins: 7000,  price: 1675, icon: "🎁" },
  { id: "pkg_15000", coins: 15000, price: 3528, icon: "🏆" },
  { id: "pkg_35000", coins: 35000, price: 8048, icon: "🏆" },
];

function CoinShopModal({ visible, onClose, apiFetch }: { visible: boolean; onClose: () => void; apiFetch: (url: string, init?: RequestInit) => Promise<Response> }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);

  const buy = async () => {
    if (!selected || buying) return;
    setBuying(true);
    try {
      const res = await apiFetch("/api/checkout/session", {
        method: "POST",
        body: JSON.stringify({ packageId: selected }),
      });
      if (res.ok) {
        const { url } = (await res.json()) as { url: string };
        if (url) {
          onClose();
          await WebBrowser.openBrowserAsync(url);
        }
      } else {
        Alert.alert("Hata", "Ödeme sistemi şu an aktif değil.");
      }
    } catch {
      Alert.alert("Hata", "Bağlantı hatası.");
    } finally {
      setBuying(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={shopStyles.backdrop} onPress={onClose} />
      <View style={shopStyles.sheet}>
        <View style={shopStyles.handle} />
        <Text style={shopStyles.title}>Coin Satın Al</Text>
        <Text style={shopStyles.sub}>Paket seçin</Text>
        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
          <View style={shopStyles.grid}>
            {COIN_PKGS.map((pkg) => (
              <Pressable
                key={pkg.id}
                onPress={() => setSelected(pkg.id === selected ? null : pkg.id)}
                style={[shopStyles.pkgCard, selected === pkg.id && shopStyles.pkgSelected]}
              >
                <Text style={shopStyles.pkgIcon}>{pkg.icon}</Text>
                <Text style={shopStyles.pkgCoins}>{pkg.coins.toLocaleString("tr-TR")}</Text>
                <Text style={shopStyles.pkgCoinLabel}>coin</Text>
                <Text style={shopStyles.pkgPrice}>₺{pkg.price}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        <Pressable
          onPress={buy}
          disabled={!selected || buying}
          style={[shopStyles.buyBtn, (!selected || buying) && shopStyles.buyBtnDisabled]}
        >
          {buying ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={shopStyles.buyBtnText}>
              {selected
                ? `${(COIN_PKGS.find((p) => p.id === selected)?.coins ?? 0).toLocaleString("tr-TR")} Coin Satın Al`
                : "Paket Seçin"}
            </Text>
          )}
        </Pressable>
      </View>
    </Modal>
  );
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
  const [showShop, setShowShop] = useState(false);

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
        <Pressable onPress={() => setShowShop(true)} style={styles.shopBtn}>
          <Feather name="shopping-bag" size={20} color="#fbbf24" />
        </Pressable>
      </View>

      <View style={[styles.balanceCard, { backgroundColor: "#f0fdf4" }]}>
        <Feather name="award" size={28} color="#f59e0b" />
        <Text style={styles.balanceNum}>{balance}</Text>
        <Text style={styles.balanceLabel}>Mevcut Coin</Text>
        <View style={styles.btnRow}>
          <Pressable onPress={claimDaily} disabled={claimingDaily} style={[styles.actionBtn, { backgroundColor: "#16a34a" }]}>
            {claimingDaily ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Feather name="gift" size={15} color="#fff" />
                <Text style={styles.actionBtnText}>Günlük +50</Text>
              </>
            )}
          </Pressable>
          <Pressable onPress={() => setShowShop(true)} style={[styles.actionBtn, { backgroundColor: "#f59e0b" }]}>
            <Feather name="shopping-bag" size={15} color="#fff" />
            <Text style={styles.actionBtnText}>Coin Al</Text>
          </Pressable>
        </View>
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
          ListHeaderComponent={
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>İşlem Geçmişi</Text>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="award" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Henüz işlem yok.</Text>
            </View>
          }
        />
      )}

      <CoinShopModal visible={showShop} onClose={() => { setShowShop(false); load(); }} apiFetch={apiFetch} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: "#052e16", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  shopBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  balanceCard: { margin: 16, borderRadius: 20, padding: 24, alignItems: "center", gap: 6 },
  balanceNum: { fontSize: 42, fontWeight: "900", color: "#111827" },
  balanceLabel: { fontSize: 14, color: "#6b7280" },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionLabel: { fontSize: 12, fontWeight: "600", paddingHorizontal: 4, paddingBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
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

const shopStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === "ios" ? 40 : 24 },
  handle: { width: 40, height: 4, backgroundColor: "#e5e7eb", borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  title: { fontSize: 20, fontWeight: "800", color: "#111827", marginBottom: 4 },
  sub: { fontSize: 13, color: "#6b7280", marginBottom: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  pkgCard: { width: "30%", borderRadius: 16, borderWidth: 2, borderColor: "#e5e7eb", padding: 12, alignItems: "center", gap: 4 },
  pkgSelected: { borderColor: "#f59e0b", backgroundColor: "#fffbeb" },
  pkgIcon: { fontSize: 22 },
  pkgCoins: { fontSize: 15, fontWeight: "800", color: "#111827" },
  pkgCoinLabel: { fontSize: 10, color: "#6b7280" },
  pkgPrice: { fontSize: 13, fontWeight: "600", color: "#374151", marginTop: 2 },
  buyBtn: { backgroundColor: "#f59e0b", borderRadius: 20, paddingVertical: 14, alignItems: "center", marginTop: 16 },
  buyBtnDisabled: { backgroundColor: "#d1d5db" },
  buyBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
