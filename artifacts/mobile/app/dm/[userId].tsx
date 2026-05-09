import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Message {
  id: number;
  senderId: string;
  content: string;
  createdAt: string;
}

interface Thread {
  userId: string;
  displayName: string;
  photoUrl: string | null;
}

export default function DMScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/dms/${userId}`);
      if (res.ok) {
        const d = (await res.json()) as { messages: Message[]; partner: Thread };
        setMessages(d.messages ?? []);
        if (d.partner) setThread(d.partner);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [apiFetch, userId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const content = text.trim();
    setText("");
    try {
      await apiFetch(`/api/dms/${userId}`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      await load();
    } catch {
    } finally {
      setSending(false);
    }
  };

  const handleMore = () => {
    const partnerName = thread?.displayName ?? "Kullanıcı";
    Alert.alert(partnerName, "Ne yapmak istersin?", [
      {
        text: "Şikayet Et",
        onPress: () => {
          Alert.alert("Şikayet", "Şikayet sebebini seç:", [
            { text: "Spam", onPress: () => reportUser("spam") },
            { text: "Uygunsuz Davranış", onPress: () => reportUser("inappropriate") },
            { text: "Taciz", onPress: () => reportUser("harassment") },
            { text: "İptal", style: "cancel" },
          ]);
        },
      },
      {
        text: "Engelle",
        style: "destructive",
        onPress: () => {
          Alert.alert("Engelle", `${partnerName} kullanıcısını engellemek istiyor musun?`, [
            { text: "İptal", style: "cancel" },
            { text: "Engelle", style: "destructive", onPress: () => blockUser() },
          ]);
        },
      },
      { text: "İptal", style: "cancel" },
    ]);
  };

  const reportUser = async (reason: string) => {
    try {
      await apiFetch("/api/reports", {
        method: "POST",
        body: JSON.stringify({ reportedUserId: userId, reason }),
      });
      Alert.alert("Teşekkürler", "Şikayetiniz alındı. İnceleyeceğiz.");
    } catch {
      Alert.alert("Hata", "Şikayet gönderilemedi.");
    }
  };

  const blockUser = async () => {
    try {
      await apiFetch("/api/bans", {
        method: "POST",
        body: JSON.stringify({ blockedUserId: userId }),
      });
      Alert.alert("Engellendi", "Kullanıcı engellendi.", [
        { text: "Tamam", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert("Hata", "Kullanıcı engellenemedi.");
    }
  };

  const renderMsg = ({ item }: { item: Message }) => {
    const isMe = item.senderId === user?.id;
    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        <View style={[styles.bubble, isMe ? [styles.bubbleMe, { backgroundColor: colors.primary }] : [styles.bubbleOther, { backgroundColor: colors.card }]]}>
          <Text style={[styles.bubbleText, { color: isMe ? "#fff" : colors.foreground }]}>{item.content}</Text>
          <Text style={[styles.bubbleTime, { color: isMe ? "rgba(255,255,255,0.65)" : colors.mutedForeground }]}>
            {new Date(item.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
      </View>
    );
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;
  const partnerInitial = (thread?.displayName ?? "?").charAt(0).toUpperCase();

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCenter}>
          {thread?.photoUrl ? (
            <Image source={{ uri: thread.photoUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatarPlaceholder, { backgroundColor: colors.primary }]}>
              <Text style={styles.headerAvatarInitial}>{partnerInitial}</Text>
            </View>
          )}
          <Text style={[styles.headerName, { color: colors.foreground }]} numberOfLines={1}>
            {thread?.displayName ?? "Mesaj"}
          </Text>
        </View>
        <Pressable onPress={handleMore} style={styles.moreBtn}>
          <Feather name="more-vertical" size={22} color={colors.foreground} />
        </Pressable>
      </View>

      <FlatList
        ref={flatRef}
        data={[...messages].reverse()}
        keyExtractor={(m) => String(m.id)}
        renderItem={renderMsg}
        inverted
        contentContainerStyle={{ padding: 16, gap: 8 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyMsg}>
            <Text style={{ color: colors.mutedForeground, textAlign: "center" }}>
              Henüz mesaj yok. İlk mesajı gönder!
            </Text>
          </View>
        }
      />

      <View style={[styles.inputBar, { borderTopColor: colors.border, paddingBottom: botPad + 8 }]}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground }]}
          value={text}
          onChangeText={setText}
          placeholder="Mesaj yaz..."
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={1000}
        />
        <Pressable
          onPress={send}
          disabled={!text.trim() || sending}
          style={({ pressed }) => [
            styles.sendBtn,
            { backgroundColor: text.trim() ? colors.primary : colors.muted },
            pressed && { opacity: 0.8 },
          ]}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Feather name="send" size={18} color={text.trim() ? "#fff" : colors.mutedForeground} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    backgroundColor: "#fff",
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  moreBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 4 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18 },
  headerAvatarPlaceholder: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerAvatarInitial: { fontSize: 15, fontWeight: "700", color: "#fff" },
  headerName: { fontSize: 16, fontWeight: "700", flex: 1 },
  msgRow: { flexDirection: "row", marginBottom: 4 },
  msgRowMe: { justifyContent: "flex-end" },
  bubble: { maxWidth: "75%", borderRadius: 16, padding: 12, gap: 4 },
  bubbleMe: { borderBottomRightRadius: 4 },
  bubbleOther: { borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTime: { fontSize: 11, alignSelf: "flex-end" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    backgroundColor: "#fff",
  },
  input: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyMsg: { padding: 40, alignItems: "center" },
});
