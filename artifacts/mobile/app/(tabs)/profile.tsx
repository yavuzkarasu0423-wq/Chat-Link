import { useAuth } from "@/contexts/AuthContext";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";

interface Profile {
  displayName: string;
  photoUrl: string | null;
  age: number;
  country: string;
  bio: string | null;
  interests: string[];
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { apiFetch } = useApi();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [coins, setCoins] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [profileRes, coinsRes] = await Promise.all([
        apiFetch("/api/profile/me"),
        apiFetch("/api/coins/me"),
      ]);
      if (profileRes.ok) {
        const d = (await profileRes.json()) as { profile: Profile };
        setProfile(d.profile);
      }
      if (coinsRes.ok) {
        const d = (await coinsRes.json()) as { balance: number };
        setCoins(d.balance ?? 0);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const handleLogout = () => {
    Alert.alert("Çıkış Yap", "Oturumunuzu kapatmak istiyor musunuz?", [
      { text: "İptal", style: "cancel" },
      {
        text: "Çıkış Yap",
        style: "destructive",
        onPress: async () => {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          logout();
        },
      },
    ]);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;
  const displayName = profile?.displayName ?? user?.firstName ?? "Kullanıcı";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: botPad + 90 }}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={["#052e16", "#14532d"]}
        style={[styles.headerBg, { paddingTop: topPad + 16 }]}
      >
        <View style={styles.avatarArea}>
          <Pressable onPress={() => router.push("/profile-edit")} style={styles.avatarWrap}>
            <View style={styles.avatarCircle}>
              {profile?.photoUrl ? (
                <Image source={{ uri: profile.photoUrl }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarInitial}>{initial}</Text>
              )}
            </View>
            <View style={styles.editBadge}>
              <Feather name="camera" size={12} color="#fff" />
            </View>
          </Pressable>
          {loading ? (
            <ActivityIndicator color="#4ade80" style={{ marginTop: 12 }} />
          ) : (
            <>
              <Text style={styles.name}>{displayName}</Text>
              {user?.email && <Text style={styles.email}>{user.email}</Text>}
              {profile && (
                <Text style={styles.countryAge}>
                  {profile.country} · {profile.age} yaş
                </Text>
              )}
            </>
          )}
        </View>

        <Pressable onPress={() => router.push("/coin-history")} style={styles.coinRow}>
          <Feather name="award" size={18} color="#f59e0b" />
          <Text style={styles.coinAmount}>{coins} Coin</Text>
          <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.5)" />
        </Pressable>
      </LinearGradient>

      {profile?.bio && (
        <View style={styles.bioCard}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Hakkımda</Text>
          <Text style={[styles.bioText, { color: colors.foreground }]}>{profile.bio}</Text>
        </View>
      )}

      {profile?.interests && profile.interests.length > 0 && (
        <View style={styles.bioCard}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>İlgi Alanları</Text>
          <View style={styles.interestWrap}>
            {profile.interests.map((i) => (
              <View key={i} style={[styles.interestChip, { backgroundColor: colors.muted }]}>
                <Text style={[styles.interestText, { color: colors.foreground }]}>{i}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={[styles.section, { borderColor: colors.border }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Hesap</Text>

        <SettingRow
          icon="user"
          label="Profili Düzenle"
          onPress={() => router.push("/profile-edit")}
          colors={colors}
        />
        <SettingRow
          icon="award"
          label="Coin Geçmişi"
          onPress={() => router.push("/coin-history")}
          colors={colors}
        />
        <SettingRow
          icon="shield"
          label="Gizlilik Politikası"
          onPress={() => WebBrowser.openBrowserAsync(`https://${DOMAIN}/privacy`)}
          colors={colors}
        />
        <SettingRow
          icon="bell"
          label="Bildirimler"
          onPress={() => Alert.alert("Bildirimler", "Bildirim ayarları yakında eklenecek.")}
          colors={colors}
        />
      </View>

      <View style={[styles.section, { borderColor: colors.border }]}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Uygulama</Text>
        <SettingRow
          icon="help-circle"
          label="Yardım & Destek"
          onPress={() => WebBrowser.openBrowserAsync(`https://${DOMAIN}/#contact`)}
          colors={colors}
        />
        <SettingRow
          icon="file-text"
          label="Kullanım Şartları"
          onPress={() => WebBrowser.openBrowserAsync(`https://${DOMAIN}/terms`)}
          colors={colors}
        />
        <SettingRow
          icon="info"
          label="Hakkımızda"
          onPress={() => WebBrowser.openBrowserAsync(`https://${DOMAIN}/#about`)}
          colors={colors}
        />
      </View>

      <Pressable
        onPress={handleLogout}
        style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
      >
        <Feather name="log-out" size={18} color="#ef4444" />
        <Text style={styles.logoutText}>Çıkış Yap</Text>
      </Pressable>
    </ScrollView>
  );
}

function SettingRow({
  icon,
  label,
  onPress,
  colors,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingRow,
        { borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.muted },
      ]}
    >
      <View style={[styles.settingIcon, { backgroundColor: colors.accent }]}>
        <Feather name={icon as "user"} size={16} color={colors.primary} />
      </View>
      <Text style={[styles.settingLabel, { color: colors.foreground }]}>{label}</Text>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerBg: { paddingHorizontal: 20, paddingBottom: 24 },
  avatarArea: { alignItems: "center", gap: 8 },
  avatarWrap: { position: "relative" },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#f97316",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.25)",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarInitial: { fontSize: 32, fontWeight: "800", color: "#fff" },
  editBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#052e16",
  },
  name: { fontSize: 22, fontWeight: "800", color: "#fff", marginTop: 4 },
  email: { fontSize: 13, color: "rgba(255,255,255,0.6)" },
  countryAge: { fontSize: 13, color: "rgba(255,255,255,0.5)" },
  coinRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
    backgroundColor: "rgba(245,158,11,0.15)",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
    alignSelf: "center",
  },
  coinAmount: { fontSize: 16, fontWeight: "700", color: "#fbbf24" },
  bioCard: { margin: 16, marginBottom: 0, padding: 16, backgroundColor: "#f9fafb", borderRadius: 16 },
  section: { marginHorizontal: 16, marginTop: 16, borderRadius: 16, borderWidth: 1, overflow: "hidden", backgroundColor: "#fff" },
  sectionLabel: { fontSize: 12, fontWeight: "600", letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, textTransform: "uppercase" },
  bioText: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  interestWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  interestChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  interestText: { fontSize: 13 },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
  },
  settingIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  settingLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "#fef2f2",
  },
  logoutText: { fontSize: 16, fontWeight: "600", color: "#ef4444" },
});
