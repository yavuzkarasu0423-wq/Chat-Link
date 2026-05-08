import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function LoginScreen() {
  const { user, isLoading, login } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [logging, setLogging] = useState(false);

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (user) return <Redirect href="/(tabs)" />;

  const handleLogin = async () => {
    setLogging(true);
    try {
      await login();
    } finally {
      setLogging(false);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <LinearGradient
      colors={["#052e16", "#166534", "#16a34a"]}
      style={[styles.container, { paddingTop: topPad, paddingBottom: botPad + 32 }]}
    >
      <View style={styles.logoArea}>
        <View style={styles.logoCircle}>
          <Image
            source={require("../assets/images/icon.png")}
            style={styles.logoImg}
            resizeMode="cover"
          />
        </View>
        <Text style={styles.appName}>1v1 Chat</Text>
        <Text style={styles.tagline}>Yüz yüze, gerçek sohbet</Text>
      </View>

      <View style={styles.features}>
        {[
          { icon: "video", text: "Görüntülü sohbet" },
          { icon: "message-circle", text: "Anlık mesajlaşma" },
          { icon: "users", text: "Arkadaş sistemi" },
        ].map((f) => (
          <View key={f.icon} style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Feather name={f.icon as "video"} size={18} color="#4ade80" />
            </View>
            <Text style={styles.featureText}>{f.text}</Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={handleLogin}
        disabled={logging}
        style={({ pressed }) => [styles.loginBtn, pressed && { opacity: 0.85 }]}
      >
        {logging ? (
          <ActivityIndicator color="#052e16" />
        ) : (
          <>
            <Feather name="log-in" size={20} color="#052e16" />
            <Text style={styles.loginBtnText}>Replit ile Giriş Yap</Text>
          </>
        )}
      </Pressable>

      <Text style={styles.terms}>
        Giriş yaparak Kullanım Şartlarını kabul etmiş olursunuz.
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: "space-between",
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  logoArea: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#14532d",
    borderWidth: 2,
    borderColor: "rgba(74,222,128,0.3)",
  },
  logoImg: { width: "100%", height: "100%" },
  appName: {
    fontSize: 36,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: -1,
  },
  tagline: { fontSize: 15, color: "rgba(255,255,255,0.6)", marginTop: 4 },
  features: { gap: 16, marginBottom: 32 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(74,222,128,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { fontSize: 16, color: "#ffffff", fontWeight: "500" },
  loginBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#4ade80",
    borderRadius: 16,
    paddingVertical: 16,
  },
  loginBtnText: { fontSize: 17, fontWeight: "700", color: "#052e16" },
  terms: { textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 16 },
});
