import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const COUNTRIES = [
  "Türkiye", "Almanya", "Hollanda", "Fransa", "Birleşik Krallık", "İtalya",
  "Mısır", "Suudi Arabistan", "Birleşik Arap Emirlikleri", "Fas", "Tunus",
  "Cezayir", "Brezilya", "ABD", "Meksika", "Hindistan", "Endonezya",
  "Filipinler", "Vietnam", "Tayland", "Diğer",
];

const ALL_INTERESTS = [
  "Müzik", "Film", "Spor", "Seyahat", "Yemek", "Oyun", "Sanat",
  "Fotoğraf", "Dans", "Kitap", "Doğa", "Moda", "Teknoloji", "Hayvanlar",
  "Fitness", "Yoga", "Anime", "Astroloji",
];

interface Profile {
  displayName: string;
  age: number;
  gender: string;
  country: string;
  bio: string | null;
  interests: string[];
  photoUrl: string | null;
}

export default function ProfileEditScreen() {
  const { apiFetch } = useApi();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [country, setCountry] = useState("Türkiye");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/profile/me");
      if (res.ok) {
        const d = (await res.json()) as { profile: Profile };
        const p = d.profile;
        setDisplayName(p.displayName ?? "");
        setAge(String(p.age ?? ""));
        setGender(p.gender ?? "");
        setCountry(p.country ?? "Türkiye");
        setBio(p.bio ?? "");
        setInterests(p.interests ?? []);
        setPhotoUrl(p.photoUrl ?? null);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("İzin Gerekli", "Fotoğraf seçmek için galeri iznine ihtiyaç var.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        const dataUrl = `data:image/jpeg;base64,${asset.base64}`;
        if (dataUrl.length > 1_500_000) {
          Alert.alert("Dosya Büyük", "Lütfen daha küçük bir fotoğraf seç.");
          return;
        }
        setPhotoUrl(dataUrl);
      } else if (asset.uri) {
        setPhotoUrl(asset.uri);
      }
    }
  };

  const toggleInterest = (i: string) => {
    setInterests((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : prev.length >= 8 ? prev : [...prev, i],
    );
  };

  const save = async () => {
    const ageNum = parseInt(age, 10);
    if (!displayName.trim()) { Alert.alert("Hata", "İsim boş olamaz."); return; }
    if (!Number.isFinite(ageNum) || ageNum < 18 || ageNum > 120) { Alert.alert("Hata", "Geçerli bir yaş gir (18-120)."); return; }
    if (!gender) { Alert.alert("Hata", "Cinsiyet seç."); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/profile/me", {
        method: "PUT",
        body: JSON.stringify({ displayName: displayName.trim(), age: ageNum, gender, country, bio: bio.trim() || null, interests, photoUrl }),
      });
      if (res.ok) {
        Alert.alert("Kaydedildi", "Profilin güncellendi.", [{ text: "Tamam", onPress: () => router.back() }]);
      } else {
        const d = (await res.json()) as { error?: string };
        Alert.alert("Hata", d.error ?? "Kaydedilemedi.");
      }
    } catch {
      Alert.alert("Hata", "Bağlantı hatası.");
    } finally {
      setSaving(false);
    }
  };

  const initial = displayName.charAt(0).toUpperCase() || "?";

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={[styles.navBar, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.foreground }]}>Profili Düzenle</Text>
        <Pressable onPress={save} disabled={saving} style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Kaydet</Text>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.photoSection}>
          <Pressable onPress={pickPhoto} style={styles.photoWrap}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.photo} />
            ) : (
              <View style={[styles.photoPlaceholder, { backgroundColor: colors.primary }]}>
                <Text style={styles.photoInitial}>{initial}</Text>
              </View>
            )}
            <View style={[styles.photoOverlay]}>
              <Feather name="camera" size={18} color="#fff" />
            </View>
          </Pressable>
          <Text style={[styles.photoHint, { color: colors.mutedForeground }]}>Fotoğraf değiştir</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>GÖRÜNEN AD</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground }]} value={displayName} onChangeText={setDisplayName} maxLength={64} placeholderTextColor={colors.mutedForeground} placeholder="Görünen adın" />
        </View>

        <View style={styles.row}>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>YAŞ</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground }]} value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={3} placeholder="18" placeholderTextColor={colors.mutedForeground} />
          </View>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>CİNSİYET</Text>
            <View style={styles.genderRow}>
              {[{ val: "kadin", label: "Kadın" }, { val: "erkek", label: "Erkek" }, { val: "diger", label: "Diğer" }].map((g) => (
                <Pressable key={g.val} onPress={() => setGender(g.val)} style={[styles.genderBtn, { backgroundColor: gender === g.val ? colors.primary : colors.muted }]}>
                  <Text style={[styles.genderText, { color: gender === g.val ? "#fff" : colors.foreground }]}>{g.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>ÜLKE</Text>
          <Pressable onPress={() => setShowCountryPicker((v) => !v)} style={[styles.input, { backgroundColor: colors.muted, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
            <Text style={{ color: colors.foreground }}>{country}</Text>
            <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
          </Pressable>
          {showCountryPicker && (
            <View style={[styles.countryList, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {COUNTRIES.map((c) => (
                <Pressable key={c} onPress={() => { setCountry(c); setShowCountryPicker(false); }} style={[styles.countryItem, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.countryItemText, { color: c === country ? colors.primary : colors.foreground }]}>{c}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>HAKKIMDA</Text>
          <TextInput style={[styles.input, styles.textArea, { backgroundColor: colors.muted, color: colors.foreground }]} value={bio} onChangeText={setBio} maxLength={500} multiline numberOfLines={3} placeholder="Kendinden kısaca bahset..." placeholderTextColor={colors.mutedForeground} />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>İLGİ ALANLARI (en fazla 8)</Text>
          <View style={styles.interestWrap}>
            {ALL_INTERESTS.map((i) => {
              const on = interests.includes(i);
              return (
                <Pressable key={i} onPress={() => toggleInterest(i)} style={[styles.interestChip, { backgroundColor: on ? colors.primary : colors.muted }]}>
                  <Text style={[styles.interestText, { color: on ? "#fff" : colors.foreground }]}>{i}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  navBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  navTitle: { fontSize: 17, fontWeight: "700" },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  content: { padding: 20, gap: 20 },
  photoSection: { alignItems: "center", gap: 8 },
  photoWrap: { position: "relative" },
  photo: { width: 88, height: 88, borderRadius: 44 },
  photoPlaceholder: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
  photoInitial: { fontSize: 32, fontWeight: "800", color: "#fff" },
  photoOverlay: { position: "absolute", bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
  photoHint: { fontSize: 12 },
  fieldGroup: { gap: 8 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 12 },
  genderRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  genderBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  genderText: { fontSize: 13, fontWeight: "600" },
  countryList: { borderRadius: 12, borderWidth: 1, marginTop: 4, maxHeight: 200, overflow: "scroll" },
  countryItem: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  countryItemText: { fontSize: 14 },
  interestWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  interestChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  interestText: { fontSize: 13, fontWeight: "600" },
});
