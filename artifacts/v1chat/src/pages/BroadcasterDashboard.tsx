import { useEffect, useState } from "react";

interface BroadcasterProfile {
  userId: string;
  fullName: string;
  iban: string;
  bankName: string | null;
  coinRateKurus: number;
  platformCutPercent: number;
  isActive: boolean;
  notes: string | null;
}

interface EarningRow {
  id: number;
  weekStart: string;
  weekEnd: string;
  totalCoins: number;
  totalTlKurus: number;
  status: string;
  paidAt: string | null;
  paymentNote: string | null;
}

interface CurrentWeek {
  coins: number;
  estimatedTlKurus: number;
}

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, { credentials: "include", ...opts });
}

export default function BroadcasterDashboard({ onClose }: { onClose: () => void }) {
  const [profile, setProfile] = useState<BroadcasterProfile | null>(null);
  const [earnings, setEarnings] = useState<EarningRow[]>([]);
  const [currentWeek, setCurrentWeek] = useState<CurrentWeek | null>(null);
  const [loading, setLoading] = useState(true);

  const [editMode, setEditMode] = useState(false);
  const [fullName, setFullName] = useState("");
  const [iban, setIban] = useState("");
  const [bankName, setBankName] = useState("");
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [p, e] = await Promise.all([
        apiFetch("/api/broadcasters/me").then((r) => r.json()) as Promise<{ profile: BroadcasterProfile | null }>,
        apiFetch("/api/broadcasters/me/earnings").then((r) => r.json()) as Promise<{ earnings: EarningRow[]; currentWeek: CurrentWeek }>,
      ]);
      setProfile(p.profile);
      setEarnings(e.earnings ?? []);
      setCurrentWeek(e.currentWeek ?? null);
      if (p.profile) {
        setFullName(p.profile.fullName);
        setIban(p.profile.iban);
        setBankName(p.profile.bankName ?? "");
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaveMsg(null);
    const r = await apiFetch("/api/broadcasters/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, iban, bankName }),
    });
    const d = await r.json() as { ok?: boolean; error?: string };
    if (d.ok) {
      setSaveMsg({ ok: true, text: "Bilgiler kaydedildi." });
      setEditMode(false);
      const p = await apiFetch("/api/broadcasters/me").then((r) => r.json()) as { profile: BroadcasterProfile | null };
      setProfile(p.profile);
    } else {
      setSaveMsg({ ok: false, text: d.error ?? "Hata oluştu." });
    }
  };

  const netKurus = profile ? profile.coinRateKurus * (1 - profile.platformCutPercent / 100) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎙️</span>
            <div>
              <h2 className="text-lg font-bold text-white">Yayıncı Paneliniz</h2>
              <p className="text-xs text-gray-500">Kazanç ve IBAN bilgileriniz</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Bu Hafta Özet */}
              {currentWeek && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-amber-900/20 border border-amber-700/30 rounded-2xl px-5 py-4">
                    <p className="text-xs text-amber-400 font-semibold uppercase tracking-wide mb-1">Bu Hafta Coin</p>
                    <p className="text-3xl font-bold text-white">{currentWeek.coins} 🪙</p>
                  </div>
                  <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-2xl px-5 py-4">
                    <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wide mb-1">Tahmini Kazanç</p>
                    <p className="text-3xl font-bold text-white">{(currentWeek.estimatedTlKurus / 100).toFixed(2)} ₺</p>
                  </div>
                </div>
              )}

              {/* Oran Bilgisi */}
              {profile && (
                <div className="bg-gray-800 rounded-2xl px-5 py-4 text-sm text-gray-300 space-y-1">
                  <p>💰 Coin başına kazanç: <span className="font-bold text-white">{netKurus.toFixed(2)} kuruş</span></p>
                  <p>📊 Platform kesintisi: <span className="font-bold text-white">%{profile.platformCutPercent}</span></p>
                  <p>📍 Durum: <span className={`font-bold ${profile.isActive ? "text-emerald-400" : "text-red-400"}`}>{profile.isActive ? "Aktif" : "Pasif"}</span></p>
                  {profile.notes && <p className="text-xs text-gray-500 pt-1">📝 {profile.notes}</p>}
                </div>
              )}

              {/* IBAN Bilgileri */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Ödeme Bilgileri</h3>
                  <button onClick={() => { setEditMode(!editMode); setSaveMsg(null); }} className="text-xs text-indigo-400 hover:text-indigo-300">
                    {editMode ? "İptal" : "Düzenle ✏️"}
                  </button>
                </div>

                {saveMsg && (
                  <div className={`px-3 py-2 rounded-lg text-xs font-medium ${saveMsg.ok ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700/40" : "bg-red-900/40 text-red-300 border border-red-700/40"}`}>
                    {saveMsg.text}
                  </div>
                )}

                {editMode ? (
                  <div className="space-y-3">
                    <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ad Soyad (IBAN sahibi)" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="TR... IBAN (26 karakter)" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" />
                    <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Banka Adı (opsiyonel)" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <button onClick={handleSave} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors">
                      Kaydet
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-2 border-b border-gray-800">
                      <span className="text-gray-500">Ad Soyad</span>
                      <span className="text-white font-medium">{profile?.fullName ?? <span className="text-gray-600 italic">Girilmemiş</span>}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-800">
                      <span className="text-gray-500">IBAN</span>
                      <span className="text-white font-mono text-xs">{profile?.iban ? `${profile.iban.slice(0, 8)}…${profile.iban.slice(-4)}` : <span className="text-gray-600 italic">Girilmemiş</span>}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-gray-500">Banka</span>
                      <span className="text-white">{profile?.bankName ?? <span className="text-gray-600 italic">—</span>}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Geçmiş Kazançlar */}
              {earnings.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">📋 Önceki Haftalar</h3>
                  </div>
                  <div className="divide-y divide-gray-800">
                    {earnings.map((e) => (
                      <div key={e.id} className="px-5 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-xs text-gray-400">
                            {new Date(e.weekStart).toLocaleDateString("tr-TR")} — {new Date(e.weekEnd).toLocaleDateString("tr-TR")}
                          </p>
                          <p className="text-sm font-semibold text-white">{(e.totalTlKurus / 100).toFixed(2)} ₺ <span className="text-xs text-gray-500">({e.totalCoins} coin)</span></p>
                          {e.paymentNote && <p className="text-xs text-gray-500">{e.paymentNote}</p>}
                        </div>
                        <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold ${e.status === "paid" ? "bg-emerald-900/60 text-emerald-300" : e.status === "cancelled" ? "bg-red-900/60 text-red-300" : "bg-amber-900/60 text-amber-300"}`}>
                          {e.status === "paid" ? "✅ Ödendi" : e.status === "cancelled" ? "❌ İptal" : "⏳ Bekliyor"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!profile && (
                <div className="text-center py-8 text-gray-500 text-sm">
                  Yayıncı profiliniz henüz oluşturulmamış. Lütfen yönetici ile iletişime geçin.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
