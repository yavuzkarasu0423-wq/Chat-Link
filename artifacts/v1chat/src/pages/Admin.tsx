import { useEffect, useState } from "react";
import { useLocation } from "wouter";

interface BanRow {
  id: number;
  blockerId: string;
  blockedId: string;
  displayName: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface ReportRow {
  id: number;
  reporterId: string;
  reportedId: string;
  reason: string;
  notes: string | null;
  status: string;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string | null;
  displayName: string | null;
  country: string | null;
  createdAt: string;
}

interface Stats {
  userCount: number;
  openReports: number;
}

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"reports" | "users" | "coins" | "bans" | "roles">("reports");
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [bans, setBans] = useState<BanRow[]>([]);
  const [banMsg, setBanMsg] = useState<string | null>(null);

  // Coin distribution form state
  const [coinUserId, setCoinUserId] = useState("");
  const [coinAmount, setCoinAmount] = useState("");
  const [coinReason, setCoinReason] = useState("");
  const [coinLoading, setCoinLoading] = useState(false);
  const [coinMsg, setCoinMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Roles tab
  const [roles, setRoles] = useState<{ userId: string; role: string; displayName: string | null }[]>([]);
  const [roleInput, setRoleInput] = useState("");
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleMsg, setRoleMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Stats) => { setAllowed(true); setStats(d); })
      .catch(() => setAllowed(false));
  }, []);

  useEffect(() => {
    if (!allowed) return;
    if (tab === "reports") {
      fetch("/api/admin/reports", { credentials: "include" })
        .then((r) => r.json())
        .then((d: { reports: ReportRow[] }) => setReports(d.reports || []));
    } else if (tab === "users") {
      fetch("/api/admin/users", { credentials: "include" })
        .then((r) => r.json())
        .then((d: { users: UserRow[] }) => setUsers(d.users || []));
    } else if (tab === "bans") {
      fetch("/api/admin/bans", { credentials: "include" })
        .then((r) => r.json())
        .then((d: { bans: BanRow[] }) => setBans(d.bans || []));
    } else if (tab === "roles") {
      fetch("/api/admin/roles", { credentials: "include" })
        .then((r) => r.json())
        .then((d: { roles: { userId: string; role: string; displayName: string | null }[] }) => setRoles(d.roles || []));
    }
  }, [allowed, tab]);

  const resolve = async (id: number) => {
    await fetch(`/api/admin/reports/${id}/resolve`, { method: "POST", credentials: "include" });
    setReports((r) => r.filter((x) => x.id !== id));
  };

  // Bug 5 fix: admin ban butonu
  const ban = async (userId: string, hours?: number) => {
    const res = await fetch("/api/admin/ban", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, durationHours: hours }),
    });
    if (res.ok) {
      setBanMsg(hours ? `${hours} saat ban uygulandı.` : "Kalıcı ban uygulandı.");
      setTimeout(() => setBanMsg(null), 3000);
    }
  };

  const resolveAndBan = async (report: ReportRow) => {
    await ban(report.reportedId, 24);
    await resolve(report.id);
  };

  const resolveAll = async () => {
    if (!confirm("Tüm açık şikayetler çözülsün mü?")) return;
    await fetch("/api/admin/reports/resolve-all", { method: "POST", credentials: "include" });
    setReports([]);
    setBanMsg("Tüm şikayetler çözüldü.");
    setTimeout(() => setBanMsg(null), 3000);
  };

  if (allowed === null) return <div className="p-10 text-center text-gray-400">Yükleniyor…</div>;
  if (!allowed) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl p-6 text-center shadow max-w-sm">
          <h2 className="text-lg font-bold mb-2">Erişim yok</h2>
          <p className="text-sm text-gray-500 mb-4">Bu sayfa yalnızca yöneticiler içindir.</p>
          <button onClick={() => setLocation("/")} className="bg-emerald-500 text-white px-5 py-2 rounded-full font-semibold text-sm">Geri dön</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-bold text-gray-900">1v1 Chat — Admin</h1>
          {stats && (
            <div className="flex gap-3 text-xs">
              <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-semibold">👥 {stats.userCount} kullanıcı</span>
              <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full font-semibold">⚠️ {stats.openReports} şikayet</span>
            </div>
          )}
        </div>
        <button onClick={() => setLocation("/")} className="text-sm text-gray-500 hover:text-gray-800">Uygulamaya dön</button>
      </header>

      {banMsg && (
        <div className="mx-6 mt-4 bg-emerald-100 text-emerald-800 text-sm font-semibold px-4 py-2 rounded-xl">
          ✅ {banMsg}
        </div>
      )}

      <div className="px-6 py-4">
        <div className="flex gap-2 mb-4 flex-wrap">
          <button onClick={() => setTab("reports")} className={`px-4 py-1.5 rounded-full text-sm font-semibold ${tab === "reports" ? "bg-emerald-500 text-white" : "bg-white border border-gray-200 text-gray-700"}`}>
            Açık Şikayetler ({reports.length})
          </button>
          <button onClick={() => setTab("users")} className={`px-4 py-1.5 rounded-full text-sm font-semibold ${tab === "users" ? "bg-emerald-500 text-white" : "bg-white border border-gray-200 text-gray-700"}`}>
            Kullanıcılar ({users.length || "…"})
          </button>
          <button onClick={() => setTab("coins")} className={`px-4 py-1.5 rounded-full text-sm font-semibold ${tab === "coins" ? "bg-orange-500 text-white" : "bg-white border border-gray-200 text-gray-700"}`}>
            🎁 Coin Dağıt
          </button>
          <button onClick={() => setTab("bans")} className={`px-4 py-1.5 rounded-full text-sm font-semibold ${tab === "bans" ? "bg-red-500 text-white" : "bg-white border border-gray-200 text-gray-700"}`}>
            🚫 Banlar ({bans.length || "…"})
          </button>
          <button onClick={() => setTab("roles")} className={`px-4 py-1.5 rounded-full text-sm font-semibold ${tab === "roles" ? "bg-purple-600 text-white" : "bg-white border border-gray-200 text-gray-700"}`}>
            🛡️ Roller ({roles.length || "…"})
          </button>
          {tab === "reports" && reports.length > 0 && (
            <button onClick={resolveAll} className="ml-auto px-4 py-1.5 rounded-full text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-600 border border-gray-200 transition-colors">
              Tümünü Çöz ({reports.length})
            </button>
          )}
        </div>

        {tab === "reports" && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left p-3">Tarih</th>
                  <th className="text-left p-3">Şikayetçi</th>
                  <th className="text-left p-3">Şikayet edilen</th>
                  <th className="text-left p-3">Sebep</th>
                  <th className="text-left p-3">Kanıt</th>
                  <th className="text-left p-3">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reports.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">Açık şikayet yok.</td></tr>
                )}
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 text-gray-500 text-xs whitespace-nowrap">{new Date(r.createdAt).toLocaleString("tr-TR")}</td>
                    <td className="p-3 font-mono text-xs">{r.reporterId.slice(0, 10)}</td>
                    <td className="p-3 font-mono text-xs">{r.reportedId.slice(0, 10)}</td>
                    <td className="p-3 text-xs">{r.reason}</td>
                    <td className="p-3 text-xs">
                      {r.notes && r.notes.startsWith("data:image") ? (
                        <a href={r.notes} target="_blank" rel="noopener noreferrer">
                          <img src={r.notes} alt="snapshot" className="w-16 h-12 object-cover rounded cursor-pointer hover:opacity-80" />
                        </a>
                      ) : r.notes ? (
                        <span className="text-gray-400 italic text-xs">Not var</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 flex-wrap">
                        <button onClick={() => resolve(r.id)} className="bg-emerald-500 text-white text-xs px-2 py-1 rounded-full whitespace-nowrap">Çöz</button>
                        <button onClick={() => resolveAndBan(r)} className="bg-red-500 text-white text-xs px-2 py-1 rounded-full whitespace-nowrap">Çöz + 24s Ban</button>
                        <button onClick={() => ban(r.reportedId)} className="bg-gray-800 text-white text-xs px-2 py-1 rounded-full whitespace-nowrap">Kalıcı Ban</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Coin Distribution Tab (#7) */}
        {tab === "coins" && (
          <div className="max-w-md bg-white rounded-2xl shadow-sm p-6">
            <h2 className="font-bold text-gray-900 mb-4">Kullanıcıya Coin Gönder</h2>
            {coinMsg && (
              <div className={`mb-4 px-4 py-2 rounded-xl text-sm font-semibold ${coinMsg.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                {coinMsg.ok ? "✅" : "❌"} {coinMsg.text}
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600">Kullanıcı ID</label>
                <input
                  type="text"
                  value={coinUserId}
                  onChange={(e) => setCoinUserId(e.target.value)}
                  placeholder="replitUserId123"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Coin Miktarı</label>
                <input
                  type="number"
                  value={coinAmount}
                  onChange={(e) => setCoinAmount(e.target.value)}
                  placeholder="500"
                  min="1"
                  max="1000000"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Açıklama (isteğe bağlı)</label>
                <input
                  type="text"
                  value={coinReason}
                  onChange={(e) => setCoinReason(e.target.value)}
                  placeholder="Etkinlik ödülü"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                />
              </div>
              <button
                disabled={coinLoading || !coinUserId || !coinAmount}
                onClick={async () => {
                  setCoinLoading(true);
                  setCoinMsg(null);
                  try {
                    const res = await fetch("/api/admin/coins/distribute", {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ userId: coinUserId.trim(), amount: Number(coinAmount), reason: coinReason.trim() || undefined }),
                    });
                    const d = await res.json() as { ok?: boolean; error?: string };
                    if (res.ok && d.ok) {
                      setCoinMsg({ ok: true, text: `${coinAmount} coin gönderildi.` });
                      setCoinUserId(""); setCoinAmount(""); setCoinReason("");
                    } else {
                      setCoinMsg({ ok: false, text: d.error ?? "Hata oluştu" });
                    }
                  } catch {
                    setCoinMsg({ ok: false, text: "Bağlantı hatası" });
                  } finally {
                    setCoinLoading(false);
                  }
                }}
                className="w-full bg-orange-500 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {coinLoading ? "Gönderiliyor…" : "Coin Gönder"}
              </button>
            </div>
          </div>
        )}

        {/* Bans Tab */}
        {tab === "bans" && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left p-3">Tarih</th>
                  <th className="text-left p-3">Engelleyen</th>
                  <th className="text-left p-3">Engellenen</th>
                  <th className="text-left p-3">Görünen Ad</th>
                  <th className="text-left p-3">Bitiş</th>
                  <th className="text-left p-3">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bans.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">Aktif ban yok.</td></tr>
                )}
                {bans.map((b) => (
                  <tr key={b.id}>
                    <td className="p-3 text-gray-400 text-xs whitespace-nowrap">{new Date(b.createdAt).toLocaleString("tr-TR")}</td>
                    <td className="p-3 font-mono text-xs">{b.blockerId.slice(0, 10)}</td>
                    <td className="p-3 font-mono text-xs">{b.blockedId.slice(0, 10)}</td>
                    <td className="p-3 text-xs font-semibold">{b.displayName ?? "—"}</td>
                    <td className="p-3 text-xs text-gray-500">{b.expiresAt ? new Date(b.expiresAt).toLocaleDateString("tr-TR") : "Kalıcı"}</td>
                    <td className="p-3">
                      <button
                        onClick={async () => {
                          await fetch(`/api/admin/bans/${b.id}`, { method: "DELETE", credentials: "include" });
                          setBans((prev) => prev.filter((x) => x.id !== b.id));
                        }}
                        className="bg-red-500 text-white text-xs px-2 py-1 rounded-full"
                      >
                        Kaldır
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Roles Tab */}
        {tab === "roles" && (
          <div className="max-w-md space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="font-bold text-gray-900 mb-4">Admin Rolü Ver</h2>
              {roleMsg && (
                <div className={`mb-4 px-4 py-2 rounded-xl text-sm font-semibold ${roleMsg.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                  {roleMsg.ok ? "✅" : "❌"} {roleMsg.text}
                </div>
              )}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600">Kullanıcı ID</label>
                  <input
                    type="text"
                    value={roleInput}
                    onChange={(e) => setRoleInput(e.target.value)}
                    placeholder="replitUserId123"
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
                  />
                </div>
                <button
                  disabled={roleLoading || !roleInput.trim()}
                  onClick={async () => {
                    setRoleLoading(true);
                    setRoleMsg(null);
                    try {
                      const res = await fetch("/api/admin/roles", {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId: roleInput.trim() }),
                      });
                      const d = await res.json() as { ok?: boolean; error?: string };
                      if (res.ok && d.ok) {
                        setRoleMsg({ ok: true, text: "Admin rolü verildi." });
                        setRoleInput("");
                        const rd = await fetch("/api/admin/roles", { credentials: "include" }).then(r => r.json()) as { roles: { userId: string; role: string; displayName: string | null }[] };
                        setRoles(rd.roles || []);
                      } else {
                        setRoleMsg({ ok: false, text: d.error ?? "Hata oluştu" });
                      }
                    } catch {
                      setRoleMsg({ ok: false, text: "Bağlantı hatası" });
                    } finally {
                      setRoleLoading(false);
                    }
                  }}
                  className="w-full bg-purple-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {roleLoading ? "İşleniyor…" : "Admin Yap"}
                </button>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="font-bold text-gray-900 mb-4">Mevcut Adminler</h2>
              {roles.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Henüz admin yok.</p>
              ) : (
                <div className="space-y-2">
                  {roles.map((r) => (
                    <div key={r.userId} className="flex items-center justify-between gap-3 bg-purple-50 rounded-xl px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{r.displayName ?? "Profil yok"}</p>
                        <p className="text-xs font-mono text-gray-400 truncate">{r.userId.slice(0, 16)}…</p>
                      </div>
                      <button
                        onClick={async () => {
                          await fetch(`/api/admin/roles/${encodeURIComponent(r.userId)}`, { method: "DELETE", credentials: "include" });
                          setRoles((prev) => prev.filter((x) => x.userId !== r.userId));
                        }}
                        className="text-xs bg-red-500 text-white px-3 py-1 rounded-full shrink-0 hover:bg-red-600"
                      >
                        Kaldır
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "users" && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left p-3">Kullanıcı ID</th>
                  <th className="text-left p-3">Görünen Ad</th>
                  <th className="text-left p-3">E-posta</th>
                  <th className="text-left p-3">Ülke</th>
                  <th className="text-left p-3">Kayıt tarihi</th>
                  <th className="text-left p-3">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">Kullanıcı yok.</td></tr>
                )}
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="p-3 font-mono text-xs text-gray-400">{u.id.slice(0, 12)}…</td>
                    <td className="p-3 font-semibold text-gray-800">{u.displayName ?? <span className="text-gray-400 italic">Profil yok</span>}</td>
                    <td className="p-3 text-xs text-gray-500">{u.email ?? "—"}</td>
                    <td className="p-3 text-xs text-gray-500">{u.country ?? "—"}</td>
                    <td className="p-3 text-xs text-gray-400">{new Date(u.createdAt).toLocaleDateString("tr-TR")}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button onClick={() => ban(u.id, 24)} className="bg-orange-500 text-white text-xs px-2 py-1 rounded-full">24s Ban</button>
                        <button onClick={() => ban(u.id)} className="bg-red-600 text-white text-xs px-2 py-1 rounded-full">Kalıcı</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
