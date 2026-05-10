import { useApi } from "@/hooks/useApi";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";

interface Status {
  currentStreak: number;
  canClaim: boolean;
  hoursUntilNext: number;
  nextStreak: number;
  nextReward: number;
  ladder: number[];
}

interface Props {
  onClaimed?: (reward: number, balance: number) => void;
}

export default function DailyRewardCard({ onClaimed }: Props) {
  const { apiFetch } = useApi();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch("/api/daily-reward/status");
      if (res.ok) setStatus((await res.json()) as Status);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [apiFetch]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleClaim = async () => {
    if (!status?.canClaim || claiming) return;
    setClaiming(true);
    try {
      if (Platform.OS !== "web") {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      const res = await apiFetch("/api/daily-reward/claim", { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { reward: number; balance: number; newStreak: number };
        onClaimed?.(data.reward, data.balance);
        await refresh();
      }
    } catch { /* ignore */ }
    finally { setClaiming(false); }
  };

  if (loading || !status) {
    return (
      <View style={[styles.card, { alignItems: "center" }]}>
        <ActivityIndicator color="#a855f7" />
      </View>
    );
  }

  return (
    <LinearGradient colors={["#581c87", "#7c3aed"]} style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>🗓️ Günlük Ödül</Text>
        <Text style={styles.streak}>{status.currentStreak} gün üst üste 🔥</Text>
      </View>

      <View style={styles.ladder}>
        {status.ladder.map((amount, i) => {
          const day = i + 1;
          const claimed = day <= status.currentStreak;
          const isNext = status.canClaim && day === ((status.currentStreak % status.ladder.length) + 1);
          return (
            <View key={day} style={[styles.day, claimed && styles.dayClaimed, isNext && styles.dayNext]}>
              <Text style={[styles.dayLabel, (claimed || isNext) && styles.dayLabelOn]}>
                {day}.
              </Text>
              <Text style={[styles.dayAmount, (claimed || isNext) && styles.dayAmountOn]}>
                {amount}
              </Text>
            </View>
          );
        })}
      </View>

      {status.canClaim ? (
        <Pressable onPress={handleClaim} style={({ pressed }) => [styles.claimBtn, pressed && { opacity: 0.85 }]}>
          {claiming ? (
            <ActivityIndicator color="#581c87" />
          ) : (
            <>
              <Feather name="gift" size={16} color="#581c87" />
              <Text style={styles.claimText}>Bugünkü {status.nextReward} coin'i al</Text>
            </>
          )}
        </Pressable>
      ) : (
        <View style={styles.waitBox}>
          <Feather name="clock" size={14} color="rgba(255,255,255,0.7)" />
          <Text style={styles.waitText}>
            Sonraki ödül {status.hoursUntilNext}sa sonra ({status.nextReward} coin)
          </Text>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#fff", fontSize: 16, fontWeight: "800" },
  streak: { color: "#fbbf24", fontSize: 12, fontWeight: "700" },
  ladder: { flexDirection: "row", gap: 4 },
  day: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  dayClaimed: { backgroundColor: "rgba(34,197,94,0.3)" },
  dayNext: { backgroundColor: "rgba(251,191,36,0.4)", borderWidth: 1, borderColor: "#fbbf24" },
  dayLabel: { color: "rgba(255,255,255,0.5)", fontSize: 9, fontWeight: "700" },
  dayLabelOn: { color: "#fff" },
  dayAmount: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "800", marginTop: 2 },
  dayAmountOn: { color: "#fff" },
  claimBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: "#fbbf24" },
  claimText: { color: "#581c87", fontWeight: "800", fontSize: 14 },
  waitBox: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 },
  waitText: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
});
