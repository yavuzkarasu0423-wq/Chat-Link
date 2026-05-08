import { useState, type FormEvent } from "react";

interface ProfileSetupProps {
  defaultName: string;
  defaultPhoto: string | null;
  onSaved: () => void;
  onLogout: () => void;
}

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

export default function ProfileSetup({
  defaultName,
  defaultPhoto,
  onSaved,
  onLogout,
}: ProfileSetupProps) {
  const [displayName, setDisplayName] = useState(defaultName);
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [country, setCountry] = useState("Türkiye");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleInterest = (i: string) => {
    setInterests((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : prev.length >= 8 ? prev : [...prev, i],
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const ageNum = parseInt(age, 10);
    if (!displayName.trim() || displayName.length > 64) {
      setError("Lütfen geçerli bir isim gir (en fazla 64 karakter).");
      return;
    }
    if (!Number.isFinite(ageNum) || ageNum < 18 || ageNum > 120) {
      setError("Yaşın 18 ile 120 arasında olmalı.");
      return;
    }
    if (!gender) {
      setError("Lütfen cinsiyetini seç.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          age: ageNum,
          gender,
          country,
          bio: bio.trim() || null,
          interests,
          photoUrl: defaultPhoto,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-white rounded-3xl shadow-xl p-6 sm:p-8 space-y-5"
      >
        <div className="text-center">
          {defaultPhoto ? (
            <img
              src={defaultPhoto}
              alt=""
              className="w-20 h-20 rounded-full mx-auto mb-3 object-cover ring-4 ring-emerald-100"
            />
          ) : (
            <div className="w-20 h-20 rounded-full mx-auto mb-3 bg-emerald-500 text-white text-3xl font-bold flex items-center justify-center">
              {(defaultName || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-2xl font-black text-gray-900">Profilini Oluştur</h1>
          <p className="text-sm text-gray-500 mt-1">
            Karşı tarafın seni nasıl tanıyacağını belirle.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Görünen ad</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={64}
            required
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Yaş</label>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              min={18}
              max={120}
              required
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Cinsiyet</label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none bg-white"
            >
              <option value="">Seç</option>
              <option value="kadin">Kadın</option>
              <option value="erkek">Erkek</option>
              <option value="diger">Diğer</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Ülke</label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none bg-white"
          >
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Hakkımda <span className="text-gray-400 font-normal">(opsiyonel)</span>
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={2}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none resize-none"
            placeholder="Kendinden kısaca bahset..."
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2">
            İlgi alanların <span className="text-gray-400 font-normal">(en fazla 8)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {ALL_INTERESTS.map((i) => {
              const on = interests.includes(i);
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => toggleInterest(i)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    on
                      ? "bg-emerald-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {i}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
        >
          {saving ? "Kaydediliyor..." : "Devam et"}
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Çıkış yap
        </button>
      </form>
    </div>
  );
}
