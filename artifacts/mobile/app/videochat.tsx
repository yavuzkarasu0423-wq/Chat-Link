import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";

export default function VideoChatScreen() {
  const { sessionId } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const url = `https://${DOMAIN}/chat?sid=${sessionId ?? ""}`;

  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.location.href = `https://${DOMAIN}/chat?sid=${sessionId ?? ""}`;
    }
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: "#052e16" }]}>
        <ActivityIndicator color="#4ade80" size="large" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: "rgba(255,255,255,0.1)", backgroundColor: "#052e16" }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Text style={[styles.headerTitle, { color: "#fff" }]}>Görüntülü Sohbet</Text>
        <Pressable
          onPress={() => webViewRef.current?.reload()}
          style={styles.backBtn}
        >
          <Feather name="refresh-cw" size={18} color="#fff" />
        </Pressable>
      </View>

      {error ? (
        <View style={styles.centered}>
          <Feather name="wifi-off" size={48} color="#9ca3af" />
          <Text style={styles.errorText}>Bağlanılamadı</Text>
          <Pressable
            onPress={() => { setError(false); webViewRef.current?.reload(); }}
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>Tekrar Dene</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color="#4ade80" size="large" />
              <Text style={styles.loadingText}>Yükleniyor...</Text>
            </View>
          )}
          <WebView
            ref={webViewRef}
            source={{ uri: url }}
            style={styles.webview}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            javaScriptEnabled
            domStorageEnabled
            allowsBackForwardNavigationGestures
            userAgent="1v1Chat-Mobile/1.0"
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  webview: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#052e16",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    zIndex: 10,
  },
  loadingText: { color: "#4ade80", fontSize: 15, fontWeight: "600" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 },
  webMsg: { fontSize: 16, textAlign: "center", lineHeight: 24 },
  errorText: { color: "#9ca3af", fontSize: 16, fontWeight: "600" },
  retryBtn: { backgroundColor: "#4ade80", borderRadius: 16, paddingHorizontal: 24, paddingVertical: 12 },
  retryText: { color: "#052e16", fontWeight: "700", fontSize: 15 },
});
