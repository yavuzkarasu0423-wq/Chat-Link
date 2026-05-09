import { useAuth } from "@/contexts/AuthContext";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Profile {
  displayName: string;
  photoUrl: string | null;
  age: number;
  country: string;
  bio: string | null;
}

interface CoinBalance {
  balance: number;
}

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";

export default function HomeScreen() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [coins, setCoins] = useState(0);
  const [activeUsers, setActiveUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const pulseAnim = new Animated.Value(1);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [profileRes, coinsRes, presenceRes] = await Promise.all([
          apiFetch("/api/profile/me"),
          apiFetch("/api/coins/me"),
          apiFetch("/api/presence/online"),
        ]);
        if (profileRes.ok) {
          const d = (await profileRes.json()) as { profile: Profile };
          setProfile(d.profile);
        }
        if (coinsRes.ok) {
          const d = (await coinsRes.json()) as CoinBalance;
          setCoins(d.balance ?? 0);
        }
        if (presenceRes.ok) {
          const d = (await presenceRes.json()) as { count: number };
          setActiveUsers(d.count ?? 0);
        }
      } catch {
      } finally {
        setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [apiFetch]);

  const handleVideoChat = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await WebBrowser.openBrowserAsync(`https://${DOMAIN}/`);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const displayName = profile?.displayName ?? user?.firstName ?? "Kullanıcı";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: "#ecfdf5" }}>
      <LinearGradient
        colors={["#052e16", "#14532d"]}
        style={[styles.header, { paddingTop: topPad + 12 }]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>Merhaba 👋</Text>
            <Text style={styles.displayName}>{displayName}</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.coinBadge}>
              <Feather name="award" size={14} color="#f59e0b" />
              <Text style={styles.coinText}>{coins}</Text>
            </View>
            <View style={styles.avatarCircle}>
              {profile?.photoUrl ? (
                <Image source={{ uri: profile.photoUrl }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarInitial}>{initial}</Text>
              )}
            </View>
          </View>
        </View>

        {activeUsers > 0 && (
          <View style={styles.onlineBadge}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>{activeUsers} kişi şu an çevrimiçi</Text>
          </View>
        )}
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: botPad + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            <View style={styles.mainCard}>
              <Text style={styles.mainTitle}>Görüntülü Sohbet</Text>
              <Text style={styles.mainSubtitle}>
                Dünyanın dört bir yanından insanlarla tanış
              </Text>

              <Animated.View style={{ transform: [{ scale: pulseAnim }], marginTop: 24 }}>
                <Pressable
                  onPress={handleVideoChat}
                  style={({ pressed }) => [styles.startBtn, pressed && { opacity: 0.9 }]}
                >
                  <LinearGradient
                    colors={["#4ade80", "#22c55e"]}
                    style={styles.startBtnInner}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Feather name="video" size={24} color="#052e16" />
                    <Text style={styles.startBtnText}>Sohbete Başla</Text>
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            </View>

            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: "#fff7ed" }]}>
                <Feather name="award" size={22} color="#f59e0b" />
                <Text style={styles.statNum}>{coins}</Text>
                <Text style={styles.statLabel}>Coin</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: "#f0fdf4" }]}>
                <Feather name="users" size={22} color="#16a34a" />
                <Text style={styles.statNum}>{activeUsers}</Text>
                <Text style={styles.statLabel}>Çevrimiçi</Text>
              </View>
            </View>

          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: { fontSize: 13, color: "rgba(255,255,255,0.6)" },
  displayName: { fontSize: 22, fontWeight: "800", color: "#ffffff", marginTop: 2 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  coinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(245,158,11,0.2)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  coinText: { fontSize: 14, fontWeight: "700", color: "#fbbf24" },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f97316",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarInitial: { fontSize: 16, fontWeight: "700", color: "#fff" },
  onlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#4ade80" },
  onlineText: { fontSize: 13, color: "rgba(255,255,255,0.7)" },
  body: { padding: 16, gap: 16 },
  loadingBox: { paddingTop: 60, alignItems: "center" },
  mainCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  mainTitle: { fontSize: 24, fontWeight: "800", color: "#111827" },
  mainSubtitle: { fontSize: 14, color: "#6b7280", marginTop: 6 },
  startBtn: { borderRadius: 16, overflow: "hidden" },
  startBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    borderRadius: 16,
  },
  startBtnText: { fontSize: 18, fontWeight: "800", color: "#052e16" },
  statsRow: { flexDirection: "row", gap: 12 },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    gap: 6,
  },
  statNum: { fontSize: 24, fontWeight: "800", color: "#111827" },
  statLabel: { fontSize: 13, color: "#6b7280" },
});
