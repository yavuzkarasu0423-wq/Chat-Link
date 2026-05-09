import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Period = "daily" | "weekly" | "all-time";
type Kind = "senders" | "receivers";

interface LbRow {
  rank: number;
  userId: string;
  total: number;
  displayName: string;
  photoUrl: string | null;
  country: string | null;
  vipPlan: "bronze" | "silver" | "gold" | null;
}

interface LbResponse {
  rows: LbRow[];
  myRank: number | null;
  myTotal: number;
}

const VIP_BADGE: Record<string, string> = { bronze: "🥉", silver: "🥈", gold: "🥇" };

export default function LeaderboardScreen() {
  const { apiFetch } = useApi();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>("weekly");
  const [kind, setKind] = useState<Kind>("senders");
  const [data, setData] = useState<LbResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/leaderboard?period=${period}&kind=${kind}`);
      if (res.ok) {
        const json = (await res.json()) as LbResponse;
        setData(json);
      }
    } catch {
      /* swallow */
    } finally {
      setLoading(false);
    }
  }, [apiFetch, period, kind]);

  useEffect(() => { void load(); }, [load]);

  const topPad = Platform.OS === "web" ? 24 : insets.top;
  const botPad = Platform.OS === "web" ? 24 : insets.bottom;

  return (
    <View style={{ flex: 1, backgroundColor: "#0f172a" }}>
      <LinearGradient colors={["#1e1b4b", "#0f172a"]} style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-left" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.title}>🏆 Lider Tablosu</Text>
          <View style={{ width: 30 }} />
        </View>

        <View style={styles.kindRow}>
          {(["senders", "receivers"] as const).map((k) => (
            <Pressable key={k} onPress={() => setKind(k)} style={[styles.chip, kind === k && styles.chipActive]}>
              <Text style={[styles.chipText, kind === k && styles.chipTextActive]}>
                {k === "senders" ? "🎁 Gönderenler" : "💝 Alanlar"}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.periodRow}>
          {(["daily", "weekly", "all-time"] as const).map((p) => (
            <Pressable key={p} onPress={() => setPeriod(p)} style={[styles.periodChip, period === p && styles.periodChipActive]}>
              <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                {p === "daily" ? "Bugün" : p === "weekly" ? "Hafta" : "Tüm Zamanlar"}
              </Text>
            </Pressable>
          ))}
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: botPad + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={{ paddingTop: 60, alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !data || data.rows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🌱</Text>
            <Text style={styles.emptyTitle}>Henüz veri yok</Text>
            <Text style={styles.emptySub}>İlk hediyeyi sen gönder ve sıralamada yerini al!</Text>
          </View>
        ) : (
          <>
            {data.rows.map((row) => {
              const medal = row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : null;
              return (
                <View key={row.userId} style={[styles.card, row.rank <= 3 && styles.cardTop]}>
                  <View style={styles.rankBox}>
                    {medal ? <Text style={styles.medal}>{medal}</Text> : <Text style={styles.rankNum}>{row.rank}</Text>}
                  </View>
                  <View style={styles.avatar}>
                    {row.photoUrl ? (
                      <Image source={{ uri: row.photoUrl }} style={styles.avatarImg} />
                    ) : (
                      <Text style={styles.avatarInitial}>{row.displayName.charAt(0).toUpperCase()}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      {row.displayName}
                      {row.vipPlan ? ` ${VIP_BADGE[row.vipPlan]}` : ""}
                    </Text>
                    {row.country && <Text style={styles.country}>{row.country}</Text>}
                  </View>
                  <View style={styles.totalBox}>
                    <Feather name="award" size={14} color="#fbbf24" />
                    <Text style={styles.totalText}>{row.total.toLocaleString()}</Text>
                  </View>
                </View>
              );
            })}

            {data.myRank !== null && data.myRank > data.rows.length && (
              <View style={[styles.card, styles.myCard]}>
                <View style={styles.rankBox}><Text style={styles.rankNum}>{data.myRank}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>Sen</Text>
                </View>
                <View style={styles.totalBox}>
                  <Feather name="award" size={14} color="#fbbf24" />
                  <Text style={styles.totalText}>{data.myTotal.toLocaleString()}</Text>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: "#fff" },
  kindRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  chip: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  chipActive: { backgroundColor: "#a78bfa" },
  chipText: { color: "rgba(255,255,255,0.7)", fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: "#1e1b4b" },
  periodRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  periodChip: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  periodChipActive: { backgroundColor: "rgba(167,139,250,0.3)" },
  periodText: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "600" },
  periodTextActive: { color: "#fff" },
  list: { padding: 12, gap: 8 },
  empty: { paddingTop: 60, alignItems: "center", gap: 6 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  emptySub: { color: "rgba(255,255,255,0.5)", fontSize: 13, textAlign: "center", paddingHorizontal: 32 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 14 },
  cardTop: { backgroundColor: "rgba(251,191,36,0.12)", borderWidth: 1, borderColor: "rgba(251,191,36,0.3)" },
  myCard: { backgroundColor: "rgba(167,139,250,0.18)", borderWidth: 1, borderColor: "rgba(167,139,250,0.4)", marginTop: 8 },
  rankBox: { width: 36, alignItems: "center" },
  medal: { fontSize: 24 },
  rankNum: { color: "rgba(255,255,255,0.6)", fontWeight: "800", fontSize: 16 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#7c3aed", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  avatarInitial: { color: "#fff", fontWeight: "800", fontSize: 16 },
  name: { color: "#fff", fontWeight: "700", fontSize: 15 },
  country: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 2 },
  totalBox: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "rgba(251,191,36,0.15)", borderRadius: 10 },
  totalText: { color: "#fbbf24", fontWeight: "800", fontSize: 13 },
});
