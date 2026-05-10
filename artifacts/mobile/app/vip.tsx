import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type VipPlanId = "bronze" | "silver" | "gold";
interface PlanDef {
  id: VipPlanId;
  name: string;
  priceTry: number;
  monthlyCoins: number;
  perks: string[];
}
interface PlansResponse {
  plans: PlanDef[];
  stripeEnabled: boolean;
}
interface MeResponse {
  active: boolean;
  plan: VipPlanId | null;
  status: string | null;
  currentPeriodEnd: string | null;
}

const PLAN_GRADIENTS: Record<VipPlanId, [string, string]> = {
  bronze: ["#92400e", "#b45309"],
  silver: ["#475569", "#64748b"],
  gold:   ["#a16207", "#ca8a04"],
};
const PLAN_EMOJI: Record<VipPlanId, string> = { bronze: "🥉", silver: "🥈", gold: "🥇" };

export default function VipScreen() {
  const { apiFetch } = useApi();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<VipPlanId | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [plansRes, meRes] = await Promise.all([
          apiFetch("/api/subscription/plans"),
          apiFetch("/api/subscription/me"),
        ]);
        if (plansRes.ok) setPlans((await plansRes.json()) as PlansResponse);
        if (meRes.ok) setMe((await meRes.json()) as MeResponse);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [apiFetch]);

  const handlePurchase = async (planId: VipPlanId) => {
    if (!plans?.stripeEnabled) {
      Alert.alert("Yakında", "VIP ödeme sistemi henüz aktif değil. Yakında!");
      return;
    }
    setPurchasing(planId);
    try {
      const res = await apiFetch("/api/subscription/checkout", {
        method: "POST",
        body: JSON.stringify({ plan: planId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        Alert.alert("Hata", err.error ?? "Ödeme başlatılamadı");
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (data.url) await WebBrowser.openBrowserAsync(data.url);
    } catch {
      Alert.alert("Hata", "Bir sorun oluştu");
    } finally {
      setPurchasing(null);
    }
  };

  const handleCancel = async () => {
    Alert.alert("VIP iptali", "Aboneliğin dönem sonunda iptal edilecek. Emin misin?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "İptal Et",
        style: "destructive",
        onPress: async () => {
          const res = await apiFetch("/api/subscription/cancel", { method: "POST" });
          if (res.ok) {
            Alert.alert("Tamam", "Aboneliğin dönem sonunda iptal edilecek.");
          } else {
            Alert.alert("Hata", "İptal başarısız");
          }
        },
      },
    ]);
  };

  const topPad = Platform.OS === "web" ? 24 : insets.top;

  return (
    <View style={{ flex: 1, backgroundColor: "#0f172a" }}>
      <LinearGradient colors={["#581c87", "#0f172a"]} style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-left" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.title}>👑 VIP Üyelik</Text>
          <View style={{ width: 30 }} />
        </View>
        <Text style={styles.subtitle}>Daha iyi bir deneyim, ayrıcalıklı özellikler</Text>
        {me?.active && me.plan && (
          <View style={styles.activeBox}>
            <Text style={styles.activeText}>
              ✓ Aktif Plan: {PLAN_EMOJI[me.plan]} {me.plan.toUpperCase()}
            </Text>
            {me.currentPeriodEnd && (
              <Text style={styles.activeSub}>
                Yenilenme: {new Date(me.currentPeriodEnd).toLocaleDateString("tr-TR")}
              </Text>
            )}
            <Pressable onPress={handleCancel} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Aboneliği iptal et</Text>
            </Pressable>
          </View>
        )}
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          plans?.plans.map((plan) => {
            const isCurrent = me?.active && me.plan === plan.id;
            return (
              <View key={plan.id} style={styles.planCard}>
                <LinearGradient colors={PLAN_GRADIENTS[plan.id]} style={styles.planHeader}>
                  <Text style={styles.planEmoji}>{PLAN_EMOJI[plan.id]}</Text>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planPrice}>
                    ₺{plan.priceTry}
                    <Text style={styles.planPriceSub}> / ay</Text>
                  </Text>
                </LinearGradient>
                <View style={styles.planBody}>
                  {plan.perks.map((perk, i) => (
                    <View key={i} style={styles.perkRow}>
                      <Feather name="check-circle" size={16} color="#22c55e" />
                      <Text style={styles.perkText}>{perk}</Text>
                    </View>
                  ))}
                  <Pressable
                    disabled={isCurrent || purchasing !== null}
                    onPress={() => handlePurchase(plan.id)}
                    style={({ pressed }) => [
                      styles.buyBtn,
                      isCurrent && styles.buyBtnDisabled,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    {purchasing === plan.id ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.buyText}>{isCurrent ? "Aktif Plan" : "Şimdi Yükselt"}</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
        {plans && !plans.stripeEnabled && (
          <Text style={styles.note}>
            ℹ️ VIP ödemeler henüz aktif değil. Stripe yapılandırması tamamlandığında devreye girecek.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: "#fff" },
  subtitle: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 8, textAlign: "center" },
  activeBox: { marginTop: 12, padding: 12, backgroundColor: "rgba(34,197,94,0.15)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(34,197,94,0.3)" },
  activeText: { color: "#86efac", fontWeight: "800", fontSize: 14 },
  activeSub: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 4 },
  cancelBtn: { marginTop: 8, alignSelf: "flex-start" },
  cancelText: { color: "#fca5a5", fontSize: 12, textDecorationLine: "underline" },
  list: { padding: 16, gap: 16 },
  planCard: { borderRadius: 18, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.05)" },
  planHeader: { padding: 18, alignItems: "center" },
  planEmoji: { fontSize: 36 },
  planName: { color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 6 },
  planPrice: { color: "#fff", fontSize: 28, fontWeight: "800", marginTop: 6 },
  planPriceSub: { fontSize: 14, fontWeight: "500", color: "rgba(255,255,255,0.7)" },
  planBody: { padding: 16, gap: 10 },
  perkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  perkText: { color: "rgba(255,255,255,0.85)", fontSize: 13, flex: 1 },
  buyBtn: { marginTop: 12, paddingVertical: 14, borderRadius: 12, backgroundColor: "#a855f7", alignItems: "center" },
  buyBtnDisabled: { backgroundColor: "rgba(255,255,255,0.1)" },
  buyText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  note: { color: "rgba(255,255,255,0.5)", fontSize: 12, textAlign: "center", paddingHorizontal: 16, marginTop: 8 },
});
