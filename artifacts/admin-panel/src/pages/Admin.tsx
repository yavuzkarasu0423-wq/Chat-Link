import { useEffect, useRef, useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

interface Stats {
  userCount: number;
  openReports: number;
  matchCount: number;
  totalCoins: number;
  activeBans: number;
}

interface DashboardData {
  userGrowth: { day: string; count: number }[];
  matchGrowth: { day: string; count: number }[];
  coinFlow: { day: string; earned: number; spent: number }[];
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
  age: number | null;
  gender: string | null;
  createdAt: string;
}

interface UserDetail extends UserRow {
  bio: string | null;
  photoUrl: string | null;
  coinBalance: number;
  matchCount: number;
  reportCount: number;
  isAdmin: boolean;
  activeBan: { id: number; expiresAt: string | null } | null;
  recentTxns: { id: number; amount: number; reason: string; createdAt: string }[];
  recentMatches: { id: number; durationSeconds: number | null; startedAt: string; partnerName: string | null }[];
}

interface BanRow {
  id: number;
  blockerId: string;
  blockedId: string;
  displayName: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface TxRow {
  id: number;
  userId: string;
  amount: number;
  reason: string;
  createdAt: string;
  displayName: string | null;
}

interface AuditRow {
  id: number;
  adminId: string;
  adminName: string | null;
  action: string;
  targetUserId: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

interface LiveUser {
  userId: string;
  displayName: string | null;
  country: string | null;
  age: number | null;
  gender: string | null;
  photoUrl: string | null;
}

interface MatchRow {
  id: number;
  userAId: string;
  userBId: string;
  userAName: string | null;
  userBName: string | null;
  durationSeconds: number | null;
  startedAt: string;
  endedAt: string | null;
}

interface DemoData {
  byCountry: { country: string; count: number }[];
  byGender: { gender: string; count: number }[];
  byAge: { range: string; count: number }[];
}

interface RevenueData {
  totalPurchases: number;
  totalCoinsSold: number;
  dailyPurchases: { day: string; purchases: number; coins: number }[];
  topBuyers: { userId: string; displayName: string | null; purchases: number; totalCoins: number }[];
}

interface PhotoRow {
  userId: string;
  displayName: string | null;
  photoUrl: string;
  country: string | null;
  age: number | null;
  gender: string | null;
}

interface GiftsData {
  totalGifts: number;
  totalCoinsGifted: number;
  topSenders: { userId: string; displayName: string | null; gifts: number; totalCoins: number }[];
  topReceivers: { userId: string; displayName: string | null; gifts: number; totalCoins: number }[];
  dailyGifts: { day: string; gifts: number }[];
}

interface RetentionData {
  dau: number;
  wau: number;
  mau: number;
  avgMatchDurationSecs: number;
  newUsersByDay: { day: string; count: number }[];
  activeByDay: { day: string; count: number }[];
}

interface PendingData {
  openReports: number;
  activeBans: number;
  newUsersToday: number;
  matchesToday: number;
  purchasesToday: number;
}

interface CoinPackage {
  id: string;
  coins: number;
  price: number;
  label: string;
}

interface HealthData {
  status: string;
  timestamp: string;
  uptimeSeconds: number;
  nodeVersion: string;
  liveUsers: number;
  db: { ok: boolean; latencyMs: number };
  memory: { heapUsedMb: number; heapTotalMb: number; rssMb: number };
}

interface BroadcasterRow {
  userId: string;
  fullName: string;
  iban: string;
  bankName: string | null;
  coinRateKurus: number;
  platformCutPercent: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  displayName: string | null;
  photoUrl: string | null;
  coinsThisWeek: number;
  totalCoins: number;
}

interface EarningRow {
  id: number;
  broadcasterId: string;
  weekStart: string;
  weekEnd: string;
  totalCoins: number;
  totalTlKurus: number;
  status: string;
  paidAt: string | null;
  paymentNote: string | null;
  fullName: string;
  iban: string;
  bankName: string | null;
}

type Tab = "dashboard" | "reports" | "users" | "live" | "coins" | "bans" | "roles" | "audit" | "broadcast" | "matches" | "demographics" | "revenue" | "photos" | "gifts" | "retention" | "packages" | "health" | "broadcasters" | "earnings";

// ── Helpers ────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, { credentials: "include", ...opts });
}

function fmt(d: string) {
  return new Date(d).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

function fmtDuration(s: number | null) {
  if (!s) return "—";
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}d ${s % 60}s`;
}

function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── MiniBar chart ──────────────────────────────────────────────────────────

function MiniBar({ data, color = "#6366f1", height = 48 }: { data: { day: string; count: number }[]; color?: string; height?: number }) {
  if (!data.length) return <div className="text-gray-600 text-xs text-center py-4">Veri yok</div>;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d) => (
        <div key={d.day} className="flex-1 flex flex-col items-center gap-0.5" title={`${fmtDate(d.day)}: ${d.count}`}>
          <div
            className="w-full rounded-sm transition-all"
            style={{ height: `${Math.max((d.count / max) * (height - 16), 2)}px`, backgroundColor: color, opacity: 0.85 }}
          />
        </div>
      ))}
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color = "indigo", sub }: { label: string; value: string | number; icon: string; color?: string; sub?: string }) {
  const colors: Record<string, string> = {
    indigo: "from-indigo-500/20 to-indigo-600/10 border-indigo-500/30 text-indigo-400",
    red: "from-red-500/20 to-red-600/10 border-red-500/30 text-red-400",
    orange: "from-orange-500/20 to-orange-600/10 border-orange-500/30 text-orange-400",
    emerald: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-400",
    purple: "from-purple-500/20 to-purple-600/10 border-purple-500/30 text-purple-400",
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-xl p-4 flex flex-col gap-1`}>
      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-xs font-medium">{label}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <p className="text-2xl font-black text-white">{typeof value === "number" ? value.toLocaleString("tr-TR") : value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

// ── HorizBar chart (for demographics) ─────────────────────────────────────

function HorizBar({ data, color }: { data: { label: string; count: number }[]; color: string }) {
  if (!data.length) return <div className="text-gray-600 text-xs text-center py-4">Veri yok</div>;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-2">
      {data.slice(0, 10).map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-24 shrink-0 truncate text-right">{d.label}</span>
          <div className="flex-1 bg-gray-800 rounded-full h-2">
            <div className="h-2 rounded-full transition-all" style={{ width: `${(d.count / max) * 100}%`, backgroundColor: color }} />
          </div>
          <span className="text-xs font-bold text-gray-300 w-10 text-right">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

// ── User Detail Modal (Enhanced) ───────────────────────────────────────────

function UserModal({ userId, onClose, onBan, onRefreshStats }: {
  userId: string;
  onClose: () => void;
  onBan: (id: string, h?: number) => void;
  onRefreshStats: () => void;
}) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailMode, setEmailMode] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [coinAction, setCoinAction] = useState<"distribute" | "deduct" | "reset" | null>(null);
  const [coinAmount, setCoinAmount] = useState("");
  const [coinReason, setCoinReason] = useState("");
  const [coinLoading, setCoinLoading] = useState(false);
  const [coinMsg, setCoinMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`/api/admin/users/${userId}`)
      .then((r) => r.json())
      .then((d: { user: UserDetail }) => { setUser(d.user); setLoading(false); });
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const sendEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) return;
    setEmailLoading(true);
    try {
      const res = await apiFetch("/api/admin/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, subject: emailSubject.trim(), body: emailBody.trim() }),
      });
      const d = await res.json() as { ok?: boolean; error?: string };
      setEmailMsg(res.ok && d.ok ? { ok: true, text: "E-posta gönderildi." } : { ok: false, text: d.error ?? "Hata" });
    } catch { setEmailMsg({ ok: false, text: "Bağlantı hatası" }); }
    finally { setEmailLoading(false); }
  };

  const doCoinAction = async () => {
    if (!coinAction) return;
    setCoinLoading(true); setCoinMsg(null);
    try {
      const endpoint = coinAction === "distribute" ? "/api/admin/coins/distribute"
        : coinAction === "deduct" ? "/api/admin/coins/deduct" : "/api/admin/coins/reset";
      const body = coinAction === "reset"
        ? { userId, reason: coinReason.trim() || undefined }
        : { userId, amount: Number(coinAmount), reason: coinReason.trim() || undefined };
      const res = await apiFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json() as { ok?: boolean; error?: string };
      if (res.ok && d.ok) {
        setCoinMsg({ ok: true, text: coinAction === "reset" ? "Coin sıfırlandı." : `${coinAction === "distribute" ? "+" : "-"}${coinAmount} coin işlendi.` });
        setCoinAmount(""); setCoinReason(""); load(); onRefreshStats();
      } else { setCoinMsg({ ok: false, text: d.error ?? "Hata" }); }
    } catch { setCoinMsg({ ok: false, text: "Bağlantı hatası" }); }
    finally { setCoinLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {loading || !user ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-xl font-bold text-white shrink-0 overflow-hidden">
                {user.photoUrl ? <img src={user.photoUrl} className="w-full h-full object-cover" alt="" /> : (user.displayName?.[0] ?? "?")}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-white text-lg truncate">{user.displayName ?? <span className="text-gray-500 italic font-normal">Profil yok</span>}</p>
                <p className="text-xs text-gray-400 font-mono">{user.id}</p>
                {user.email && <p className="text-xs text-gray-500">{user.email}</p>}
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {user.country && <span className="bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded-full">{user.country}</span>}
                  {user.age && <span className="bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded-full">{user.age} yaş</span>}
                  {user.gender && <span className="bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded-full">{user.gender}</span>}
                  {user.isAdmin && <span className="bg-purple-900 text-purple-300 text-xs px-2 py-0.5 rounded-full font-semibold">Admin</span>}
                  {user.activeBan && <span className="bg-red-900 text-red-300 text-xs px-2 py-0.5 rounded-full font-semibold">🚫 Banlı</span>}
                </div>
              </div>
            </div>

            {user.bio && <p className="text-sm text-gray-400 bg-gray-800 rounded-xl px-3 py-2 italic">"{user.bio}"</p>}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-yellow-400">{user.coinBalance.toLocaleString("tr-TR")}</p>
                <p className="text-xs text-gray-500">Coin</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-indigo-400">{user.matchCount}</p>
                <p className="text-xs text-gray-500">Eşleşme</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-red-400">{user.reportCount}</p>
                <p className="text-xs text-gray-500">Şikayet</p>
              </div>
            </div>

            {/* Active ban info */}
            {user.activeBan && (
              <div className="bg-red-900/30 border border-red-800/50 rounded-xl px-3 py-2 text-xs text-red-300">
                🚫 Ban aktif — {user.activeBan.expiresAt ? `Bitiş: ${fmt(user.activeBan.expiresAt)}` : "Kalıcı ban"}
              </div>
            )}

            {/* Recent matches */}
            {user.recentMatches.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Son Eşleşmeler</p>
                <div className="space-y-1">
                  {user.recentMatches.map((m) => (
                    <div key={m.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-1.5">
                      <span className="text-xs text-gray-300">{m.partnerName ?? "Anonim"}</span>
                      <div className="flex items-center gap-3 text-[10px] text-gray-500">
                        <span>{fmtDuration(m.durationSeconds)}</span>
                        <span>{fmtDate(m.startedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent transactions */}
            {user.recentTxns.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Son Coin Hareketleri</p>
                <div className="space-y-1">
                  {user.recentTxns.map((t) => (
                    <div key={t.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-1.5">
                      <span className="text-xs text-gray-400 truncate max-w-[160px]">{t.reason}</span>
                      <span className={`text-xs font-bold ${t.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>{t.amount > 0 ? "+" : ""}{t.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Coin action */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Coin İşlemi</p>
              <div className="flex gap-1 mb-2">
                {(["distribute", "deduct", "reset"] as const).map((a) => (
                  <button key={a} onClick={() => { setCoinAction(coinAction === a ? null : a); setCoinMsg(null); }}
                    className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg transition-colors ${coinAction === a
                      ? a === "distribute" ? "bg-emerald-600 text-white" : a === "deduct" ? "bg-red-600 text-white" : "bg-gray-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}>
                    {a === "distribute" ? "🎁 Ekle" : a === "deduct" ? "➖ Düş" : "🗑️ Sıfırla"}
                  </button>
                ))}
              </div>
              {coinAction && (
                <div className="space-y-2">
                  {coinMsg && <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${coinMsg.ok ? "bg-emerald-900/50 text-emerald-300" : "bg-red-900/50 text-red-300"}`}>{coinMsg.ok ? "✅" : "❌"} {coinMsg.text}</div>}
                  {coinAction !== "reset" && <input type="number" value={coinAmount} onChange={(e) => setCoinAmount(e.target.value)} placeholder="Miktar" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500" />}
                  <input type="text" value={coinReason} onChange={(e) => setCoinReason(e.target.value)} placeholder="Açıklama (opsiyonel)" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
                  <button disabled={coinLoading || (coinAction !== "reset" && !coinAmount)} onClick={doCoinAction}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white py-2 rounded-lg text-sm font-semibold transition-colors">
                    {coinLoading ? "İşleniyor…" : "Uygula"}
                  </button>
                </div>
              )}
            </div>

            {/* Email */}
            {user.email && (
              <div>
                <button onClick={() => { setEmailMode(!emailMode); setEmailMsg(null); }}
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
                  ✉️ {emailMode ? "E-posta formunu kapat" : "E-posta Gönder"}
                </button>
                {emailMode && (
                  <div className="mt-2 space-y-2">
                    {emailMsg && <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${emailMsg.ok ? "bg-emerald-900/50 text-emerald-300" : "bg-red-900/50 text-red-300"}`}>{emailMsg.ok ? "✅" : "❌"} {emailMsg.text}</div>}
                    <input type="text" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Konu" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
                    <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} placeholder="Mesaj içeriği…" rows={3} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none" />
                    <button disabled={emailLoading || !emailSubject.trim() || !emailBody.trim()} onClick={sendEmail}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white py-2 rounded-lg text-sm font-semibold transition-colors">
                      {emailLoading ? "Gönderiliyor…" : "📨 Gönder"}
                    </button>
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-gray-600">Kayıt: {fmt(user.createdAt)}</p>

            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={() => { onBan(user.id, 24); onClose(); }} className="flex-1 bg-orange-700 hover:bg-orange-600 text-white text-sm py-2 rounded-xl font-semibold transition-colors">24s Ban</button>
              <button onClick={() => { onBan(user.id); onClose(); }} className="flex-1 bg-red-700 hover:bg-red-600 text-white text-sm py-2 rounded-xl font-semibold transition-colors">Kalıcı Ban</button>
              <button onClick={onClose} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 rounded-xl font-semibold transition-colors">Kapat</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Action colors ──────────────────────────────────────────────────────────

function actionBadge(action: string) {
  const map: Record<string, string> = {
    ban: "bg-red-900/60 text-red-300 border border-red-800",
    ban_remove: "bg-emerald-900/60 text-emerald-300 border border-emerald-800",
    report_resolve: "bg-blue-900/60 text-blue-300 border border-blue-800",
    report_resolve_all: "bg-blue-900/60 text-blue-300 border border-blue-800",
    coin_distribute: "bg-yellow-900/60 text-yellow-300 border border-yellow-800",
    coin_deduct: "bg-orange-900/60 text-orange-300 border border-orange-800",
    coin_reset: "bg-red-900/60 text-red-300 border border-red-800",
    role_grant: "bg-purple-900/60 text-purple-300 border border-purple-800",
    role_revoke: "bg-orange-900/60 text-orange-300 border border-orange-800",
    announce: "bg-cyan-900/60 text-cyan-300 border border-cyan-800",
    email_send: "bg-blue-900/60 text-blue-300 border border-blue-800",
  };
  return map[action] ?? "bg-gray-800 text-gray-400 border border-gray-700";
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [authStatus, setAuthStatus] = useState<number | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [banMsg, setBanMsg] = useState<string | null>(null);

  // Dashboard
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashDays, setDashDays] = useState(14);

  // Reports
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [reportTotal, setReportTotal] = useState(0);
  const [reportStatus, setReportStatus] = useState<"open" | "resolved">("open");

  // Users
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userCountry, setUserCountry] = useState("");
  const [userGender, setUserGender] = useState("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Live
  const [liveUsers, setLiveUsers] = useState<LiveUser[]>([]);
  const [liveCount, setLiveCount] = useState(0);

  // Coins
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txOffset, setTxOffset] = useState(0);
  const [coinUserId, setCoinUserId] = useState("");
  const [coinAmount, setCoinAmount] = useState("");
  const [coinReason, setCoinReason] = useState("");
  const [coinLoading, setCoinLoading] = useState(false);
  const [coinMsg, setCoinMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Bans
  const [bans, setBans] = useState<BanRow[]>([]);

  // Roles
  const [roles, setRoles] = useState<{ userId: string; role: string; displayName: string | null }[]>([]);
  const [roleInput, setRoleInput] = useState("");
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleMsg, setRoleMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Audit
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditOffset, setAuditOffset] = useState(0);

  // Broadcast
  const [announceText, setAnnounceText] = useState("");
  const [announceLoading, setAnnounceLoading] = useState(false);
  const [announceMsg, setAnnounceMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Matches
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [matchTotal, setMatchTotal] = useState(0);
  const [matchOffset, setMatchOffset] = useState(0);
  const [matchUserFilter, setMatchUserFilter] = useState("");
  const matchFilterTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Demographics
  const [demoData, setDemoData] = useState<DemoData | null>(null);

  // Revenue
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);
  const [revDays, setRevDays] = useState(30);

  // Photos
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  // Gifts
  const [giftsData, setGiftsData] = useState<GiftsData | null>(null);

  // Retention
  const [retentionData, setRetentionData] = useState<RetentionData | null>(null);

  // Pending tasks
  const [pending, setPending] = useState<PendingData | null>(null);

  // Packages
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [editingPkg, setEditingPkg] = useState<string | null>(null);
  const [pkgCoins, setPkgCoins] = useState("");
  const [pkgPrice, setPkgPrice] = useState("");
  const [pkgLabel, setPkgLabel] = useState("");
  const [pkgMsg, setPkgMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Health
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Broadcasters
  const [broadcasters, setBroadcasters] = useState<BroadcasterRow[]>([]);
  const [bcMsg, setBcMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bcFormUserId, setBcFormUserId] = useState("");
  const [bcFormName, setBcFormName] = useState("");
  const [bcFormIban, setBcFormIban] = useState("");
  const [bcFormBank, setBcFormBank] = useState("");
  const [bcFormRate, setBcFormRate] = useState("5");
  const [bcFormCut, setBcFormCut] = useState("50");
  const [bcFormNotes, setBcFormNotes] = useState("");
  const [bcEditing, setBcEditing] = useState<string | null>(null);

  // Earnings
  const [earnings, setEarnings] = useState<EarningRow[]>([]);
  const [earningsStatus, setEarningsStatus] = useState("pending");
  const [earningsMsg, setEarningsMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [payNoteId, setPayNoteId] = useState<number | null>(null);
  const [payNote, setPayNote] = useState("");
  const [calcLoading, setCalcLoading] = useState(false);

  // ── Auth check ──────────────────────────────────────────────────────────

  useEffect(() => {
    apiFetch("/api/admin/stats")
      .then((r) => { setAuthStatus(r.status); if (r.ok) return r.json(); return Promise.reject(r.status); })
      .then((d: Stats) => { setAllowed(true); setStats(d); })
      .catch(() => setAllowed(false));
  }, []);

  // ── Global stats + live count polling ───────────────────────────────────

  const refreshStats = useCallback(() => {
    apiFetch("/api/admin/stats")
      .then((r) => r.ok ? r.json() : null)
      .then((d: Stats | null) => { if (d) setStats(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!allowed) return;
    const fetchCount = () => {
      apiFetch("/api/admin/live-users")
        .then((r) => r.json())
        .then((d: { count: number }) => setLiveCount(d.count || 0))
        .catch(() => {});
    };
    fetchCount();
    const t = setInterval(fetchCount, 30000);
    return () => clearInterval(t);
  }, [allowed]);

  // ── Tab data loaders ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!allowed) return;

    if (tab === "dashboard") {
      setDashboard(null);
      apiFetch(`/api/admin/dashboard?days=${dashDays}`)
        .then((r) => r.json()).then((d: DashboardData) => setDashboard(d));
    } else if (tab === "reports") {
      apiFetch(`/api/admin/reports?status=${reportStatus}`)
        .then((r) => r.json())
        .then((d: { reports: ReportRow[]; total: number }) => { setReports(d.reports || []); setReportTotal(d.total || 0); });
    } else if (tab === "users") {
      loadUsers();
    } else if (tab === "live") {
      const load = () => {
        apiFetch("/api/admin/live-users")
          .then((r) => r.json())
          .then((d: { users: LiveUser[]; count: number }) => { setLiveUsers(d.users || []); setLiveCount(d.count || 0); });
      };
      load();
      const t = setInterval(load, 15000);
      return () => clearInterval(t);
    } else if (tab === "coins") {
      apiFetch(`/api/admin/coins/transactions?limit=50&offset=${txOffset}`)
        .then((r) => r.json())
        .then((d: { transactions: TxRow[]; total: number }) => { setTransactions(d.transactions || []); setTxTotal(d.total || 0); });
    } else if (tab === "bans") {
      apiFetch("/api/admin/bans").then((r) => r.json()).then((d: { bans: BanRow[] }) => setBans(d.bans || []));
    } else if (tab === "roles") {
      apiFetch("/api/admin/roles").then((r) => r.json()).then((d: { roles: { userId: string; role: string; displayName: string | null }[] }) => setRoles(d.roles || []));
    } else if (tab === "audit") {
      apiFetch(`/api/admin/audit-log?limit=100&offset=${auditOffset}`)
        .then((r) => r.json())
        .then((d: { logs: AuditRow[]; total: number }) => { setAuditLogs(d.logs || []); setAuditTotal(d.total || 0); });
    } else if (tab === "matches") {
      loadMatches();
    } else if (tab === "demographics") {
      apiFetch("/api/admin/stats/demographics").then((r) => r.json()).then((d: DemoData) => setDemoData(d));
    } else if (tab === "revenue") {
      setRevenueData(null);
      apiFetch(`/api/admin/revenue?days=${revDays}`).then((r) => r.json()).then((d: RevenueData) => setRevenueData(d));
    } else if (tab === "photos") {
      setPhotosLoading(true);
      apiFetch("/api/admin/photos").then((r) => r.json()).then((d: { photos: PhotoRow[] }) => { setPhotos(d.photos || []); setPhotosLoading(false); });
    } else if (tab === "gifts") {
      setGiftsData(null);
      apiFetch("/api/admin/gifts/stats").then((r) => r.json()).then((d: GiftsData) => setGiftsData(d));
    } else if (tab === "retention") {
      setRetentionData(null);
      apiFetch("/api/admin/retention").then((r) => r.json()).then((d: RetentionData) => setRetentionData(d));
    } else if (tab === "packages") {
      apiFetch("/api/admin/packages").then((r) => r.json()).then((d: { packages: CoinPackage[] }) => setPackages(d.packages || []));
    } else if (tab === "health") {
      setHealthData(null);
      setHealthLoading(true);
      apiFetch("/api/admin/health").then((r) => r.json()).then((d: HealthData) => { setHealthData(d); setHealthLoading(false); });
    } else if (tab === "broadcasters") {
      apiFetch("/api/admin/broadcasters").then((r) => r.json()).then((d: { broadcasters: BroadcasterRow[] }) => setBroadcasters(d.broadcasters || []));
    } else if (tab === "earnings") {
      setEarnings([]);
      apiFetch(`/api/admin/broadcasters/earnings?status=${earningsStatus}`).then((r) => r.json()).then((d: { earnings: EarningRow[] }) => setEarnings(d.earnings || []));
    }
    return;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, tab, dashDays, reportStatus, txOffset, auditOffset, revDays, earningsStatus]);

  // Pending tasks — load on dashboard or on auth
  useEffect(() => {
    if (!allowed) return;
    apiFetch("/api/admin/pending").then((r) => r.json()).then((d: PendingData) => setPending(d)).catch(() => {});
  }, [allowed, tab]);

  // ── User loader ──────────────────────────────────────────────────────────

  const loadUsers = useCallback((q = userSearch, country = userCountry, gender = userGender) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (country) params.set("country", country);
    if (gender) params.set("gender", gender);
    apiFetch(`/api/admin/users?${params}`)
      .then((r) => r.json()).then((d: { users: UserRow[] }) => setUsers(d.users || []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUserSearch = (q: string) => {
    setUserSearch(q);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => loadUsers(q, userCountry, userGender), 350);
  };

  const handleUserFilter = (country: string, gender: string) => {
    setUserCountry(country); setUserGender(gender);
    loadUsers(userSearch, country, gender);
  };

  // ── Match loader ─────────────────────────────────────────────────────────

  const loadMatches = useCallback((userId = "", offset = 0) => {
    const params = new URLSearchParams({ offset: String(offset) });
    if (userId) params.set("userId", userId);
    apiFetch(`/api/admin/matches?${params}`)
      .then((r) => r.json())
      .then((d: { matches: MatchRow[]; total: number }) => { setMatches(d.matches || []); setMatchTotal(d.total || 0); });
  }, []);

  const handleMatchFilter = (v: string) => {
    setMatchUserFilter(v); setMatchOffset(0);
    clearTimeout(matchFilterTimeout.current);
    matchFilterTimeout.current = setTimeout(() => loadMatches(v, 0), 350);
  };

  // ── Ban helper ────────────────────────────────────────────────────────────

  const ban = useCallback(async (userId: string, hours?: number) => {
    const res = await apiFetch("/api/admin/ban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, durationHours: hours }),
    });
    if (res.ok) {
      setBanMsg(hours ? `${hours} saat ban uygulandı.` : "Kalıcı ban uygulandı.");
      setTimeout(() => setBanMsg(null), 3000);
      refreshStats();
    }
  }, [refreshStats]);

  const resolve = async (id: number) => {
    await apiFetch(`/api/admin/reports/${id}/resolve`, { method: "POST" });
    setReports((r) => r.filter((x) => x.id !== id));
    setReportTotal((t) => Math.max(0, t - 1));
    refreshStats();
  };

  const resolveAndBan = async (report: ReportRow) => {
    await ban(report.reportedId, 24);
    await resolve(report.id);
  };

  const resolveAll = async () => {
    if (!confirm("Tüm açık şikayetler çözülsün mü?")) return;
    await apiFetch("/api/admin/reports/resolve-all", { method: "POST" });
    setReports([]); setReportTotal(0);
    setBanMsg("Tüm şikayetler çözüldü.");
    setTimeout(() => setBanMsg(null), 3000);
    refreshStats();
  };

  // ── Loading / Auth ──────────────────────────────────────────────────────

  if (allowed === null) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Doğrulanıyor…</p>
        </div>
      </div>
    );
  }

  if (!allowed) {
    const needsLogin = authStatus === 401 || authStatus === null;
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-950">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center max-w-sm">
          <div className="text-4xl mb-3">{needsLogin ? "🔑" : "🔒"}</div>
          <h2 className="text-lg font-bold text-white mb-2">{needsLogin ? "Giriş Gerekli" : "Erişim Reddedildi"}</h2>
          <p className="text-sm text-gray-400 mb-5">
            {needsLogin ? "Devam etmek için Replit hesabınızla giriş yapın." : "Bu panel yalnızca yöneticiler içindir."}
          </p>
          <a href={needsLogin ? "/api/login?returnTo=/admin/" : "/"} className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-full font-semibold text-sm transition-colors">
            {needsLogin ? "Replit ile Giriş Yap" : "Uygulamaya Dön"}
          </a>
        </div>
      </div>
    );
  }

  const navItems: { key: Tab; label: string; icon: string; group?: string }[] = [
    { key: "dashboard", label: "Dashboard", icon: "📊" },
    { key: "reports", label: "Şikayetler", icon: "⚠️" },
    { key: "users", label: "Kullanıcılar", icon: "👥" },
    { key: "live", label: "Canlı", icon: "🟢" },
    { key: "matches", label: "Eşleşmeler", icon: "🎥" },
    { key: "coins", label: "Coinler", icon: "💰" },
    { key: "bans", label: "Banlar", icon: "🚫" },
    { key: "demographics", label: "Demografi", icon: "🌍" },
    { key: "broadcast", label: "Duyuru", icon: "📢" },
    { key: "roles", label: "Roller", icon: "🛡️" },
    { key: "audit", label: "Audit Log", icon: "📋" },
    { key: "revenue", label: "Gelir", icon: "💳" },
    { key: "photos", label: "Foto Moderasyon", icon: "🖼️" },
    { key: "gifts", label: "Hediye İstatistikleri", icon: "🎁" },
    { key: "retention", label: "Kullanıcı Tutma", icon: "📈" },
    { key: "packages", label: "Coin Paketleri", icon: "📦" },
    { key: "health", label: "Sistem Sağlığı", icon: "🩺" },
    { key: "broadcasters", label: "Yayıncılar", icon: "🎙️" },
    { key: "earnings", label: "Haftalık Ödemeler", icon: "💸" },
  ];

  return (
    <div className="min-h-dvh bg-gray-950 text-gray-100 flex" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      {/* ── Sidebar ── */}
      <aside className="w-56 min-h-dvh bg-gray-900 border-r border-gray-800 flex flex-col py-6 px-4 gap-1 shrink-0">
        <div className="flex items-center gap-2 mb-4 px-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-xs font-bold">A</div>
          <span className="font-bold text-white text-sm">1v1 Chat Admin</span>
        </div>

        {stats && (
          <div className="mb-3 px-2 space-y-1">
            <div className="bg-gray-800 rounded-lg px-3 py-1.5 text-xs flex justify-between">
              <span className="text-gray-400">Kullanıcılar</span>
              <span className="font-bold text-white">{stats.userCount.toLocaleString("tr-TR")}</span>
            </div>
            {stats.openReports > 0 && (
              <div className="bg-red-900/40 rounded-lg px-3 py-1.5 text-xs flex justify-between">
                <span className="text-red-300">Şikayetler</span>
                <span className="font-bold text-red-200">{stats.openReports}</span>
              </div>
            )}
          </div>
        )}

        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors ${
                tab === item.key ? "bg-indigo-600 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span>{item.label}</span>
              {item.key === "reports" && (stats?.openReports ?? 0) > 0 && (
                <span className="ml-auto bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{stats!.openReports}</span>
              )}
              {item.key === "live" && liveCount > 0 && tab !== "live" && (
                <span className="ml-auto bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{liveCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto px-2">
          <a href="/" className="block text-xs text-gray-500 hover:text-gray-300 transition-colors py-2">← Uygulamaya dön</a>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 p-6 min-w-0 overflow-auto">
        {banMsg && (
          <div className="mb-4 bg-emerald-900/50 border border-emerald-700 text-emerald-300 text-sm font-semibold px-4 py-2.5 rounded-xl">✅ {banMsg}</div>
        )}

        {/* ═══════════════ DASHBOARD ═══════════════ */}
        {tab === "dashboard" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-white">Dashboard</h2>
              <div className="flex gap-1">
                {[7, 14, 30, 90].map((d) => (
                  <button key={d} onClick={() => setDashDays(d)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${dashDays === d ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}>
                    {d}g
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <StatCard label="Toplam Kullanıcı" value={stats?.userCount ?? 0} icon="👥" color="indigo" />
              <StatCard label="Açık Şikayet" value={stats?.openReports ?? 0} icon="⚠️" color="red" />
              <StatCard label="Toplam Eşleşme" value={stats?.matchCount ?? 0} icon="🎥" color="purple" />
              <StatCard label="Platform Coini" value={stats?.totalCoins ?? 0} icon="🪙" color="orange" />
              <StatCard label="Aktif Ban" value={stats?.activeBans ?? 0} icon="🚫" color="red" />
            </div>

            {/* ── Bugünün özeti ── */}
            {pending && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">📅 Bugün</p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: "Yeni Kullanıcı", value: pending.newUsersToday, icon: "🆕", color: "emerald", onClick: () => setTab("users") },
                    { label: "Eşleşme", value: pending.matchesToday, icon: "🎥", color: "purple", onClick: () => setTab("matches") },
                    { label: "Coin Satın Alma", value: pending.purchasesToday, icon: "💳", color: "orange", onClick: () => setTab("revenue") },
                    { label: "Bekleyen Şikayet", value: pending.openReports, icon: "⚠️", color: "red", onClick: () => setTab("reports") },
                    { label: "Aktif Ban", value: pending.activeBans, icon: "🚫", color: "red", onClick: () => setTab("bans") },
                  ].map((c) => (
                    <button key={c.label} onClick={c.onClick}
                      className={`bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-3 text-left transition-colors group`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-gray-400 text-xs">{c.label}</span>
                        <span className="text-lg">{c.icon}</span>
                      </div>
                      <p className={`text-2xl font-black ${c.value > 0 && (c.color === "red") ? "text-red-400" : c.value > 0 && c.color === "emerald" ? "text-emerald-400" : c.value > 0 && c.color === "orange" ? "text-orange-400" : c.value > 0 && c.color === "purple" ? "text-purple-400" : "text-white"}`}>
                        {(c.value ?? 0).toLocaleString("tr-TR")}
                      </p>
                      <p className="text-[10px] text-gray-600 mt-1 group-hover:text-gray-400 transition-colors">Detay →</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {dashboard ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Kullanıcı Büyümesi ({dashDays} gün)</p>
                  <MiniBar data={dashboard.userGrowth ?? []} color="#6366f1" />
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Günlük Eşleşmeler ({dashDays} gün)</p>
                  <MiniBar data={dashboard.matchGrowth ?? []} color="#a855f7" />
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Coin Akışı ({dashDays} gün)</p>
                  {(dashboard.coinFlow ?? []).length === 0 ? (
                    <div className="text-gray-600 text-xs text-center py-4">Veri yok</div>
                  ) : (
                    <>
                      <div className="flex items-end gap-1" style={{ height: 48 }}>
                        {dashboard.coinFlow.map((d) => {
                          const max = Math.max(...dashboard.coinFlow.map((x) => x.earned + x.spent), 1);
                          return (
                            <div key={d.day} className="flex-1 flex flex-col items-center gap-0.5" title={`${fmtDate(d.day)}: +${d.earned} -${d.spent}`}>
                              <div className="w-full flex flex-col justify-end" style={{ height: 48 }}>
                                <div className="w-full rounded-sm" style={{ height: `${Math.max((d.earned / max) * 36, 1)}px`, backgroundColor: "#f59e0b" }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex gap-3 mt-2 text-[10px] text-gray-500">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-yellow-500 inline-block" />Kazanılan</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ REPORTS ═══════════════ */}
        {tab === "reports" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-black text-white">Şikayetler</h2>
                <div className="flex gap-1">
                  {(["open", "resolved"] as const).map((s) => (
                    <button key={s} onClick={() => setReportStatus(s)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${reportStatus === s ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}>
                      {s === "open" ? `Açık (${reportTotal})` : "Çözüldü"}
                    </button>
                  ))}
                </div>
              </div>
              {reportStatus === "open" && reports.length > 0 && (
                <button onClick={resolveAll} className="text-sm bg-gray-800 hover:bg-red-900/50 border border-gray-700 hover:border-red-700 text-gray-300 hover:text-red-300 px-3 py-1.5 rounded-lg transition-colors">
                  Tümünü Çöz ({reports.length})
                </button>
              )}
              {reportStatus === "open" && (
                <button onClick={() => downloadCSV("sikayet-acik.csv", reports as unknown as Record<string, unknown>[])} className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 px-3 py-1.5 rounded-lg transition-colors">
                  ⬇ CSV
                </button>
              )}
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/50 text-gray-400 text-xs">
                  <tr>
                    <th className="text-left p-3">Tarih</th>
                    <th className="text-left p-3">Şikayetçi</th>
                    <th className="text-left p-3">Şikayet Edilen</th>
                    <th className="text-left p-3">Sebep</th>
                    <th className="text-left p-3">Kanıt</th>
                    {reportStatus === "open" && <th className="text-left p-3">İşlem</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {reports.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-500">{reportStatus === "open" ? "Açık şikayet yok ✓" : "Çözülmüş şikayet yok."}</td></tr>
                  )}
                  {reports.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-800/30">
                      <td className="p-3 text-gray-500 text-xs whitespace-nowrap">{fmt(r.createdAt)}</td>
                      <td className="p-3 font-mono text-xs text-gray-400">{r.reporterId.slice(0, 10)}</td>
                      <td className="p-3">
                        <button onClick={() => setSelectedUserId(r.reportedId)} className="font-mono text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2">{r.reportedId.slice(0, 10)}</button>
                      </td>
                      <td className="p-3 text-xs text-gray-300">{r.reason}</td>
                      <td className="p-3 text-xs">
                        {r.notes?.startsWith("data:image") ? (
                          <a href={r.notes} target="_blank" rel="noopener noreferrer">
                            <img src={r.notes} alt="snapshot" className="w-16 h-12 object-cover rounded cursor-pointer hover:opacity-80" />
                          </a>
                        ) : r.notes ? <span className="text-gray-500 italic">Not var</span> : <span className="text-gray-700">—</span>}
                      </td>
                      {reportStatus === "open" && (
                        <td className="p-3">
                          <div className="flex gap-1 flex-wrap">
                            <button onClick={() => resolve(r.id)} className="bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-2 py-1 rounded-md transition-colors">Çöz</button>
                            <button onClick={() => resolveAndBan(r)} className="bg-red-700 hover:bg-red-600 text-white text-xs px-2 py-1 rounded-md transition-colors whitespace-nowrap">Çöz + 24s Ban</button>
                            <button onClick={() => ban(r.reportedId)} className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded-md transition-colors whitespace-nowrap">Kalıcı Ban</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══════════════ USERS ═══════════════ */}
        {tab === "users" && (
          <div>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <h2 className="text-xl font-black text-white">Kullanıcılar</h2>
              <input type="text" value={userSearch} onChange={(e) => handleUserSearch(e.target.value)}
                placeholder="İsim, e-posta veya ID…"
                className="flex-1 min-w-[160px] max-w-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
              <select value={userCountry} onChange={(e) => handleUserFilter(e.target.value, userGender)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none">
                <option value="">Tüm Ülkeler</option>
                {Array.from(new Set(users.map((u) => u.country).filter(Boolean))).sort().map((c) => <option key={c!} value={c!}>{c}</option>)}
              </select>
              <select value={userGender} onChange={(e) => handleUserFilter(userCountry, e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none">
                <option value="">Tüm Cinsiyetler</option>
                <option value="male">Erkek</option>
                <option value="female">Kadın</option>
                <option value="other">Diğer</option>
              </select>
              <span className="text-xs text-gray-500">{users.length} sonuç</span>
              <button onClick={() => downloadCSV("kullanicilar.csv", users as unknown as Record<string, unknown>[])}
                className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 px-3 py-2 rounded-lg transition-colors">⬇ CSV</button>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/50 text-gray-400 text-xs">
                  <tr>
                    <th className="text-left p-3">Kullanıcı</th>
                    <th className="text-left p-3">E-posta</th>
                    <th className="text-left p-3">Ülke / Yaş</th>
                    <th className="text-left p-3">Kayıt</th>
                    <th className="text-left p-3">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {users.length === 0 && (<tr><td colSpan={5} className="text-center py-10 text-gray-500">Kullanıcı bulunamadı.</td></tr>)}
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-800/30 cursor-pointer" onClick={() => setSelectedUserId(u.id)}>
                      <td className="p-3">
                        <p className="font-semibold text-gray-200 text-sm">{u.displayName ?? <span className="text-gray-600 italic font-normal">Profil yok</span>}</p>
                        <p className="font-mono text-[10px] text-gray-600">{u.id.slice(0, 14)}…</p>
                      </td>
                      <td className="p-3 text-xs text-gray-400">{u.email ?? "—"}</td>
                      <td className="p-3 text-xs text-gray-400">{[u.country, u.age ? `${u.age} yaş` : null].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="p-3 text-xs text-gray-500 whitespace-nowrap">{new Date(u.createdAt).toLocaleDateString("tr-TR")}</td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <button onClick={() => ban(u.id, 24)} className="bg-orange-700 hover:bg-orange-600 text-white text-xs px-2 py-1 rounded-md transition-colors">24s Ban</button>
                          <button onClick={() => ban(u.id)} className="bg-red-700 hover:bg-red-600 text-white text-xs px-2 py-1 rounded-md transition-colors">Kalıcı</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══════════════ LIVE USERS ═══════════════ */}
        {tab === "live" && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-black text-white">Canlı Kullanıcılar</h2>
              <div className="flex items-center gap-1.5 bg-emerald-900/40 border border-emerald-800/50 rounded-full px-3 py-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                <span className="text-xs font-semibold text-emerald-300">{liveCount} çevrimiçi</span>
              </div>
              <span className="text-xs text-gray-600">15 saniyede bir güncellenir</span>
            </div>
            {liveUsers.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                <p className="text-4xl mb-3">🟢</p>
                <p className="text-gray-400">Şu an çevrimiçi kullanıcı yok.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {liveUsers.map((u) => (
                  <div key={u.userId} onClick={() => setSelectedUserId(u.userId)}
                    className="bg-gray-900 border border-gray-800 hover:border-emerald-700/50 rounded-xl p-3 flex flex-col items-center gap-2 cursor-pointer transition-colors group">
                    <div className="relative">
                      <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-lg font-bold overflow-hidden">
                        {u.photoUrl ? <img src={u.photoUrl} className="w-full h-full object-cover" alt="" /> : (u.displayName?.[0] ?? "?")}
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-gray-900" />
                    </div>
                    <p className="text-xs font-semibold text-gray-200 text-center truncate w-full">{u.displayName ?? "—"}</p>
                    <p className="text-[10px] text-gray-500 text-center">{[u.country, u.age ? `${u.age}` : null].filter(Boolean).join(", ")}</p>
                    <button onClick={(e) => { e.stopPropagation(); ban(u.userId, 24); }}
                      className="opacity-0 group-hover:opacity-100 text-[10px] bg-red-700 hover:bg-red-600 text-white px-2 py-0.5 rounded-full transition-all">Ban</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ MATCHES ═══════════════ */}
        {tab === "matches" && (
          <div>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <h2 className="text-xl font-black text-white">Eşleşme Geçmişi</h2>
              <input type="text" value={matchUserFilter} onChange={(e) => handleMatchFilter(e.target.value)}
                placeholder="Kullanıcı ID ile filtrele…"
                className="flex-1 min-w-[180px] max-w-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
              <span className="text-xs text-gray-500">Toplam: {matchTotal.toLocaleString("tr-TR")}</span>
              <button onClick={() => downloadCSV("eslesmeler.csv", matches as unknown as Record<string, unknown>[])}
                className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 px-3 py-2 rounded-lg transition-colors">⬇ CSV</button>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/50 text-gray-400 text-xs">
                  <tr>
                    <th className="text-left p-3">Tarih</th>
                    <th className="text-left p-3">Kullanıcı A</th>
                    <th className="text-left p-3">Kullanıcı B</th>
                    <th className="text-left p-3">Süre</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {matches.length === 0 && (<tr><td colSpan={4} className="text-center py-10 text-gray-500">Eşleşme bulunamadı.</td></tr>)}
                  {matches.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-800/30">
                      <td className="p-3 text-xs text-gray-500 whitespace-nowrap">{fmt(m.startedAt)}</td>
                      <td className="p-3">
                        <button onClick={() => setSelectedUserId(m.userAId)} className="text-sm text-gray-200 hover:text-indigo-300 transition-colors block">{m.userAName ?? "—"}</button>
                        <span className="font-mono text-[10px] text-gray-600">{m.userAId.slice(0, 10)}</span>
                      </td>
                      <td className="p-3">
                        <button onClick={() => setSelectedUserId(m.userBId)} className="text-sm text-gray-200 hover:text-indigo-300 transition-colors block">{m.userBName ?? "—"}</button>
                        <span className="font-mono text-[10px] text-gray-600">{m.userBId.slice(0, 10)}</span>
                      </td>
                      <td className="p-3 text-xs font-semibold text-indigo-300">{fmtDuration(m.durationSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {matchTotal > 50 && (
              <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                <button disabled={matchOffset === 0} onClick={() => { const o = Math.max(0, matchOffset - 50); setMatchOffset(o); loadMatches(matchUserFilter, o); }} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-40 transition-colors">← Önceki</button>
                <span>{matchOffset + 1}–{Math.min(matchOffset + 50, matchTotal)} / {matchTotal}</span>
                <button disabled={matchOffset + 50 >= matchTotal} onClick={() => { const o = matchOffset + 50; setMatchOffset(o); loadMatches(matchUserFilter, o); }} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-40 transition-colors">Sonraki →</button>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ COINS ═══════════════ */}
        {tab === "coins" && (
          <div className="space-y-6">
            <h2 className="text-xl font-black text-white">Coin Yönetimi</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Distribute */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="font-bold text-gray-200 mb-4 text-sm">🎁 Coin Ekle</h3>
                {coinMsg?.ok === true && <div className="mb-3 px-3 py-2 bg-emerald-900/50 border border-emerald-700 text-emerald-300 text-xs rounded-lg">✅ {coinMsg.text}</div>}
                {coinMsg?.ok === false && <div className="mb-3 px-3 py-2 bg-red-900/50 border border-red-700 text-red-300 text-xs rounded-lg">❌ {coinMsg.text}</div>}
                <div className="space-y-2">
                  <input type="text" value={coinUserId} onChange={(e) => setCoinUserId(e.target.value)} placeholder="Kullanıcı ID" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
                  <input type="number" value={coinAmount} onChange={(e) => setCoinAmount(e.target.value)} placeholder="Miktar" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
                  <input type="text" value={coinReason} onChange={(e) => setCoinReason(e.target.value)} placeholder="Açıklama" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
                  <button disabled={coinLoading || !coinUserId || !coinAmount} onClick={async () => {
                    setCoinLoading(true); setCoinMsg(null);
                    try {
                      const res = await apiFetch("/api/admin/coins/distribute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: coinUserId.trim(), amount: Number(coinAmount), reason: coinReason.trim() || undefined }) });
                      const d = await res.json() as { ok?: boolean; error?: string };
                      if (res.ok && d.ok) { setCoinMsg({ ok: true, text: `${coinAmount} coin eklendi.` }); setCoinUserId(""); setCoinAmount(""); setCoinReason(""); refreshStats(); }
                      else setCoinMsg({ ok: false, text: d.error ?? "Hata" });
                    } catch { setCoinMsg({ ok: false, text: "Bağlantı hatası" }); }
                    finally { setCoinLoading(false); }
                  }} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white py-2 rounded-lg font-semibold text-sm transition-colors">
                    {coinLoading ? "İşleniyor…" : "🎁 Coin Ekle"}
                  </button>
                </div>
              </div>

              {/* Deduct */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="font-bold text-gray-200 mb-4 text-sm">➖ Coin Düş</h3>
                <div className="space-y-2">
                  <input type="text" placeholder="Kullanıcı ID" id="deduct-uid" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-orange-500" />
                  <input type="number" placeholder="Miktar" id="deduct-amt" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-orange-500" />
                  <input type="text" placeholder="Açıklama" id="deduct-reason" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-orange-500" />
                  <button onClick={async () => {
                    const uid = (document.getElementById("deduct-uid") as HTMLInputElement).value.trim();
                    const amt = Number((document.getElementById("deduct-amt") as HTMLInputElement).value);
                    const reason = (document.getElementById("deduct-reason") as HTMLInputElement).value.trim();
                    if (!uid || !amt) return;
                    const res = await apiFetch("/api/admin/coins/deduct", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: uid, amount: amt, reason: reason || undefined }) });
                    const d = await res.json() as { ok?: boolean; error?: string };
                    if (res.ok && d.ok) { setBanMsg(`${uid.slice(0, 8)}… kullanıcısından ${amt} coin düşüldü.`); setTimeout(() => setBanMsg(null), 3000); refreshStats(); }
                  }} className="w-full bg-orange-600 hover:bg-orange-500 text-white py-2 rounded-lg font-semibold text-sm transition-colors">➖ Coin Düş</button>
                </div>
              </div>

              {/* Reset */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="font-bold text-gray-200 mb-4 text-sm">🗑️ Coin Sıfırla</h3>
                <div className="space-y-2">
                  <input type="text" placeholder="Kullanıcı ID" id="reset-uid" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-red-500" />
                  <input type="text" placeholder="Sebep (opsiyonel)" id="reset-reason" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-red-500" />
                  <button onClick={async () => {
                    const uid = (document.getElementById("reset-uid") as HTMLInputElement).value.trim();
                    const reason = (document.getElementById("reset-reason") as HTMLInputElement).value.trim();
                    if (!uid || !confirm(`${uid} kullanıcısının coinleri sıfırlansın mı?`)) return;
                    const res = await apiFetch("/api/admin/coins/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: uid, reason: reason || undefined }) });
                    const d = await res.json() as { ok?: boolean; prevBalance?: number; error?: string };
                    if (res.ok && d.ok) { setBanMsg(`Coin sıfırlandı (önceki: ${d.prevBalance ?? 0}).`); setTimeout(() => setBanMsg(null), 3000); refreshStats(); }
                  }} className="w-full bg-red-700 hover:bg-red-600 text-white py-2 rounded-lg font-semibold text-sm transition-colors">🗑️ Sıfırla</button>
                </div>
              </div>
            </div>

            {/* Transactions */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-200 text-sm">💸 İşlem Geçmişi</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Toplam: {txTotal.toLocaleString("tr-TR")}</span>
                  <button onClick={() => downloadCSV("coin-islemler.csv", transactions as unknown as Record<string, unknown>[])}
                    className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 px-2 py-1 rounded-lg transition-colors">⬇ CSV</button>
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800/50 text-gray-400 text-xs">
                    <tr>
                      <th className="text-left p-3">Tarih</th>
                      <th className="text-left p-3">Kullanıcı</th>
                      <th className="text-left p-3">Miktar</th>
                      <th className="text-left p-3">Açıklama</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {transactions.length === 0 && (<tr><td colSpan={4} className="text-center py-10 text-gray-500">İşlem yok.</td></tr>)}
                    {transactions.map((t) => (
                      <tr key={t.id} className="hover:bg-gray-800/30">
                        <td className="p-3 text-xs text-gray-500 whitespace-nowrap">{fmt(t.createdAt)}</td>
                        <td className="p-3">
                          <p className="text-sm text-gray-200">{t.displayName ?? "—"}</p>
                          <p className="font-mono text-[10px] text-gray-600">{t.userId.slice(0, 12)}</p>
                        </td>
                        <td className="p-3">
                          <span className={`font-bold text-sm ${t.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>{t.amount > 0 ? "+" : ""}{t.amount}</span>
                        </td>
                        <td className="p-3 text-xs text-gray-400">{t.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {txTotal > 50 && (
                <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                  <button disabled={txOffset === 0} onClick={() => setTxOffset(Math.max(0, txOffset - 50))} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-40 transition-colors">← Önceki</button>
                  <span>{txOffset + 1}–{Math.min(txOffset + 50, txTotal)} / {txTotal}</span>
                  <button disabled={txOffset + 50 >= txTotal} onClick={() => setTxOffset(txOffset + 50)} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-40 transition-colors">Sonraki →</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════ BANS ═══════════════ */}
        {tab === "bans" && (
          <div>
            <h2 className="text-xl font-black text-white mb-4">Aktif Banlar</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/50 text-gray-400 text-xs">
                  <tr>
                    <th className="text-left p-3">Tarih</th>
                    <th className="text-left p-3">Engellenen</th>
                    <th className="text-left p-3">Görünen Ad</th>
                    <th className="text-left p-3">Bitiş</th>
                    <th className="text-left p-3">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {bans.length === 0 && (<tr><td colSpan={5} className="text-center py-10 text-gray-500">Aktif ban yok ✓</td></tr>)}
                  {bans.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-800/30">
                      <td className="p-3 text-gray-500 text-xs whitespace-nowrap">{fmt(b.createdAt)}</td>
                      <td className="p-3">
                        <button onClick={() => setSelectedUserId(b.blockedId)} className="font-mono text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2">{b.blockedId.slice(0, 12)}</button>
                      </td>
                      <td className="p-3 text-sm text-gray-200 font-semibold">{b.displayName ?? "—"}</td>
                      <td className="p-3 text-xs text-gray-400">{b.expiresAt ? fmt(b.expiresAt) : <span className="text-red-400 font-semibold">Kalıcı</span>}</td>
                      <td className="p-3">
                        <button onClick={async () => { await apiFetch(`/api/admin/bans/${b.id}`, { method: "DELETE" }); setBans((prev) => prev.filter((x) => x.id !== b.id)); refreshStats(); }}
                          className="bg-gray-700 hover:bg-red-700 text-white text-xs px-2 py-1 rounded-md transition-colors">Kaldır</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══════════════ DEMOGRAPHICS ═══════════════ */}
        {tab === "demographics" && (
          <div className="space-y-6">
            <h2 className="text-xl font-black text-white">Demografi</h2>
            {!demoData ? (
              <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">🌍 Ülkeye Göre</p>
                  <HorizBar data={demoData.byCountry.map((d) => ({ label: d.country, count: d.count }))} color="#6366f1" />
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">⚧ Cinsiyete Göre</p>
                  <HorizBar data={demoData.byGender.map((d) => ({ label: d.gender, count: d.count }))} color="#a855f7" />
                  <div className="mt-4 space-y-2">
                    {demoData.byGender.map((d) => {
                      const total = demoData.byGender.reduce((s, x) => s + x.count, 0);
                      return (
                        <div key={d.gender} className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">{d.gender}</span>
                          <span className="text-gray-300 font-semibold">{total > 0 ? Math.round((d.count / total) * 100) : 0}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">🎂 Yaş Grubuna Göre</p>
                  <HorizBar data={demoData.byAge.map((d) => ({ label: d.range, count: d.count }))} color="#f59e0b" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ BROADCAST ═══════════════ */}
        {tab === "broadcast" && (
          <div className="max-w-lg space-y-4">
            <h2 className="text-xl font-black text-white">Duyuru Yayını</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-sm text-gray-400 mb-4">Tüm online kullanıcılara anlık mesaj gönder. Bakım duyurusu, etkinlik, sistem mesajı vs.</p>
              {announceMsg && (
                <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-semibold ${announceMsg.ok ? "bg-emerald-900/50 border border-emerald-700 text-emerald-300" : "bg-red-900/50 border border-red-700 text-red-300"}`}>
                  {announceMsg.ok ? "✅" : "❌"} {announceMsg.text}
                </div>
              )}
              <div className="space-y-3">
                <textarea
                  value={announceText}
                  onChange={(e) => setAnnounceText(e.target.value)}
                  placeholder="Duyuru metni… (örn: Sistem 10 dakika sonra bakıma girecek.)"
                  rows={4}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">{liveCount} kullanıcıya iletilecek</span>
                  <button
                    disabled={announceLoading || !announceText.trim()}
                    onClick={async () => {
                      setAnnounceLoading(true); setAnnounceMsg(null);
                      try {
                        const res = await apiFetch("/api/admin/announce", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: announceText.trim() }) });
                        const d = await res.json() as { ok?: boolean; error?: string };
                        if (res.ok && d.ok) { setAnnounceMsg({ ok: true, text: `Duyuru ${liveCount} kullanıcıya gönderildi.` }); setAnnounceText(""); }
                        else setAnnounceMsg({ ok: false, text: d.error ?? "Hata" });
                      } catch { setAnnounceMsg({ ok: false, text: "Bağlantı hatası" }); }
                      finally { setAnnounceLoading(false); }
                    }}
                    className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white px-5 py-2 rounded-xl font-semibold text-sm transition-colors"
                  >
                    {announceLoading ? "Gönderiliyor…" : "📢 Yayınla"}
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-xs text-gray-500">
              <p className="font-semibold text-gray-400 mb-1">ℹ️ Nasıl çalışır?</p>
              <p>Mesaj, Socket.IO üzerinden tüm bağlı kullanıcılara anlık olarak iletilir ve uygulamada bir bildirim olarak gösterilir. Offline kullanıcılar bu mesajı göremez.</p>
            </div>
          </div>
        )}

        {/* ═══════════════ ROLES ═══════════════ */}
        {tab === "roles" && (
          <div className="max-w-lg space-y-4">
            <h2 className="text-xl font-black text-white">Admin Rolleri</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="font-bold text-gray-300 mb-4 text-sm">Admin Rolü Ver</h3>
              {roleMsg && (
                <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-semibold ${roleMsg.ok ? "bg-emerald-900/50 border border-emerald-700 text-emerald-300" : "bg-red-900/50 border border-red-700 text-red-300"}`}>
                  {roleMsg.ok ? "✅" : "❌"} {roleMsg.text}
                </div>
              )}
              <div className="space-y-3">
                <input type="text" value={roleInput} onChange={(e) => setRoleInput(e.target.value)} placeholder="replitUserId123"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500" />
                <button disabled={roleLoading || !roleInput.trim()} onClick={async () => {
                  setRoleLoading(true); setRoleMsg(null);
                  try {
                    const res = await apiFetch("/api/admin/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: roleInput.trim() }) });
                    const d = await res.json() as { ok?: boolean; error?: string };
                    if (res.ok && d.ok) {
                      setRoleMsg({ ok: true, text: "Admin rolü verildi." }); setRoleInput("");
                      const rd = await apiFetch("/api/admin/roles").then((r) => r.json()) as { roles: { userId: string; role: string; displayName: string | null }[] };
                      setRoles(rd.roles || []);
                    } else setRoleMsg({ ok: false, text: d.error ?? "Hata" });
                  } catch { setRoleMsg({ ok: false, text: "Bağlantı hatası" }); }
                  finally { setRoleLoading(false); }
                }} className="w-full bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors">
                  {roleLoading ? "İşleniyor…" : "🛡️ Admin Yap"}
                </button>
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="font-bold text-gray-300 mb-4 text-sm">Mevcut Adminler ({roles.length})</h3>
              {roles.length === 0 ? (
                <p className="text-sm text-gray-600 text-center py-4">Henüz admin yok.</p>
              ) : (
                <div className="space-y-2">
                  {roles.map((r) => (
                    <div key={r.userId} className="flex items-center justify-between gap-3 bg-purple-900/20 border border-purple-800/40 rounded-xl px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-200 truncate">{r.displayName ?? "Profil yok"}</p>
                        <p className="text-xs font-mono text-gray-500 truncate">{r.userId.slice(0, 20)}</p>
                      </div>
                      <button onClick={async () => {
                        await apiFetch(`/api/admin/roles/${encodeURIComponent(r.userId)}`, { method: "DELETE" });
                        setRoles((prev) => prev.filter((x) => x.userId !== r.userId));
                      }} className="text-xs bg-red-700 hover:bg-red-600 text-white px-3 py-1 rounded-full shrink-0 transition-colors">Kaldır</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════ AUDIT LOG ═══════════════ */}
        {tab === "audit" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black text-white">Audit Log</h2>
              <span className="text-xs text-gray-500">Toplam: {auditTotal.toLocaleString("tr-TR")} kayıt</span>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/50 text-gray-400 text-xs">
                  <tr>
                    <th className="text-left p-3">Tarih</th>
                    <th className="text-left p-3">Admin</th>
                    <th className="text-left p-3">İşlem</th>
                    <th className="text-left p-3">Hedef</th>
                    <th className="text-left p-3">Detay</th>
                    <th className="text-left p-3">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {auditLogs.length === 0 && (<tr><td colSpan={6} className="text-center py-10 text-gray-500">Henüz kayıt yok.</td></tr>)}
                  {auditLogs.map((l) => (
                    <tr key={l.id} className="hover:bg-gray-800/30">
                      <td className="p-3 text-xs text-gray-500 whitespace-nowrap">{fmt(l.createdAt)}</td>
                      <td className="p-3">
                        <p className="text-xs text-gray-300">{l.adminName ?? "—"}</p>
                        <p className="font-mono text-[10px] text-gray-600">{l.adminId.slice(0, 10)}</p>
                      </td>
                      <td className="p-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${actionBadge(l.action)}`}>{l.action}</span>
                      </td>
                      <td className="p-3">
                        {l.targetUserId ? (
                          <button onClick={() => setSelectedUserId(l.targetUserId!)} className="font-mono text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                            {l.targetUserId.slice(0, 10)}
                          </button>
                        ) : <span className="text-gray-700 text-xs">—</span>}
                      </td>
                      <td className="p-3 text-xs text-gray-500 max-w-[180px] truncate" title={JSON.stringify(l.details)}>
                        {l.details ? JSON.stringify(l.details).slice(0, 60) : "—"}
                      </td>
                      <td className="p-3 font-mono text-[10px] text-gray-600">{l.ip ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {auditTotal > 100 && (
              <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                <button disabled={auditOffset === 0} onClick={() => setAuditOffset(Math.max(0, auditOffset - 100))} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-40 transition-colors">← Önceki</button>
                <span>{auditOffset + 1}–{Math.min(auditOffset + 100, auditTotal)} / {auditTotal}</span>
                <button disabled={auditOffset + 100 >= auditTotal} onClick={() => setAuditOffset(auditOffset + 100)} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-40 transition-colors">Sonraki →</button>
              </div>
            )}
          </div>
        )}
        {/* ═══════════════ REVENUE ═══════════════ */}
        {tab === "revenue" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-xl font-black text-white">💳 Gelir & Ödeme Takibi</h2>
              <div className="flex gap-1">
                {[7, 14, 30, 90].map((d) => (
                  <button key={d} onClick={() => setRevDays(d)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${revDays === d ? "bg-orange-600 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}>
                    {d}g
                  </button>
                ))}
              </div>
            </div>

            {!revenueData ? (
              <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <StatCard label="Toplam Satın Alma" value={revenueData.totalPurchases} icon="🛒" color="orange" />
                  <StatCard label="Toplam Satılan Coin" value={revenueData.totalCoinsSold.toLocaleString("tr-TR")} icon="🪙" color="orange" />
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Günlük Satın Alma ({revDays} gün)</p>
                  {revenueData.dailyPurchases.length === 0 ? (
                    <p className="text-gray-600 text-sm text-center py-6">Bu dönemde satın alma yok.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {revenueData.dailyPurchases.map((d) => (
                        <div key={d.day} className="flex items-center gap-3 text-sm">
                          <span className="text-gray-500 text-xs w-20 shrink-0">{fmtDate(d.day)}</span>
                          <div className="flex-1 bg-gray-800 rounded-full h-2">
                            <div className="h-2 rounded-full bg-orange-500" style={{ width: `${Math.max((d.purchases / Math.max(...revenueData.dailyPurchases.map((x) => x.purchases), 1)) * 100, 2)}%` }} />
                          </div>
                          <span className="text-orange-300 font-bold text-xs w-8 text-right">{d.purchases}</span>
                          <span className="text-yellow-400 text-xs w-20 text-right">{d.coins.toLocaleString("tr-TR")} 🪙</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-800">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">🏆 En Çok Satın Alan Kullanıcılar</p>
                  </div>
                  {revenueData.topBuyers.length === 0 ? (
                    <p className="text-gray-600 text-sm text-center py-8">Henüz satın alma yok.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-800/50 text-gray-400 text-xs">
                        <tr>
                          <th className="text-left p-3">Kullanıcı</th>
                          <th className="text-right p-3">Satın Alma</th>
                          <th className="text-right p-3">Toplam Coin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {revenueData.topBuyers.map((b, i) => (
                          <tr key={b.userId} className="hover:bg-gray-800/30 cursor-pointer" onClick={() => setSelectedUserId(b.userId)}>
                            <td className="p-3 flex items-center gap-2">
                              <span className="text-gray-600 font-mono text-xs w-5">{i + 1}.</span>
                              <div>
                                <p className="text-gray-200 font-semibold text-sm">{b.displayName ?? "—"}</p>
                                <p className="text-gray-600 font-mono text-[10px]">{b.userId.slice(0, 12)}</p>
                              </div>
                            </td>
                            <td className="p-3 text-right text-orange-300 font-bold">{b.purchases}</td>
                            <td className="p-3 text-right text-yellow-400 font-bold">{b.totalCoins.toLocaleString("tr-TR")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════ PHOTOS ═══════════════ */}
        {tab === "photos" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-black text-white">🖼️ Profil Fotoğrafı Moderasyonu</h2>
              <span className="text-xs text-gray-500">{photos.length} fotoğraf</span>
              <button onClick={() => { setPhotosLoading(true); apiFetch("/api/admin/photos").then((r) => r.json()).then((d: { photos: PhotoRow[] }) => { setPhotos(d.photos || []); setPhotosLoading(false); }); }}
                className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 px-3 py-1.5 rounded-lg transition-colors">
                🔄 Yenile
              </button>
            </div>
            {photosLoading ? (
              <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : photos.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                <p className="text-4xl mb-3">🖼️</p>
                <p className="text-gray-400">Profil fotoğrafı olan kullanıcı yok.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {photos.map((p) => (
                  <div key={p.userId} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden group hover:border-gray-600 transition-colors">
                    <div className="relative aspect-square">
                      <img src={p.photoUrl} alt={p.displayName ?? ""} className="w-full h-full object-cover" />
                      <button
                        onClick={async () => {
                          if (!confirm(`${p.displayName ?? p.userId} kullanıcısının fotoğrafı silinsin mi?`)) return;
                          await apiFetch(`/api/admin/photos/${p.userId}`, { method: "DELETE" });
                          setPhotos((prev) => prev.filter((x) => x.userId !== p.userId));
                          setBanMsg(`${p.displayName ?? p.userId} fotoğrafı silindi.`);
                          setTimeout(() => setBanMsg(null), 3000);
                        }}
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full transition-all">
                        Sil
                      </button>
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-semibold text-gray-200 truncate">{p.displayName ?? "—"}</p>
                      <p className="text-[10px] text-gray-500">{[p.country, p.age ? `${p.age}y` : null, p.gender].filter(Boolean).join(" · ")}</p>
                      <button onClick={() => setSelectedUserId(p.userId)} className="text-[10px] text-indigo-400 hover:text-indigo-300 mt-1 transition-colors">Profili Gör →</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ GIFTS ═══════════════ */}
        {tab === "gifts" && (
          <div className="space-y-6">
            <h2 className="text-xl font-black text-white">🎁 Hediye İstatistikleri</h2>
            {!giftsData ? (
              <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <StatCard label="Toplam Hediye" value={giftsData.totalGifts} icon="🎁" color="purple" />
                  <StatCard label="Toplam Harcanan Coin" value={giftsData.totalCoinsGifted.toLocaleString("tr-TR")} icon="🪙" color="orange" />
                </div>

                {giftsData.dailyGifts.length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Son 30 Gün — Günlük Hediye</p>
                    <MiniBar data={giftsData.dailyGifts.map((d) => ({ day: d.day, count: d.gifts }))} color="#a855f7" height={48} />
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-800">
                      <p className="text-xs font-semibold text-gray-400 uppercase">🏆 En Çok Hediye Gönderen</p>
                    </div>
                    {giftsData.topSenders.length === 0 ? (
                      <p className="text-gray-600 text-sm text-center py-8">Veri yok</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-800/50 text-gray-400 text-xs"><tr><th className="text-left p-3">Kullanıcı</th><th className="text-right p-3">Hediye</th><th className="text-right p-3">Coin</th></tr></thead>
                        <tbody className="divide-y divide-gray-800">
                          {giftsData.topSenders.map((s, i) => (
                            <tr key={s.userId} className="hover:bg-gray-800/30 cursor-pointer" onClick={() => setSelectedUserId(s.userId)}>
                              <td className="p-3"><span className="text-gray-600 text-xs mr-2">{i + 1}.</span><span className="text-gray-200">{s.displayName ?? "—"}</span></td>
                              <td className="p-3 text-right text-purple-300 font-bold">{s.gifts}</td>
                              <td className="p-3 text-right text-yellow-400 text-xs">{s.totalCoins.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-800">
                      <p className="text-xs font-semibold text-gray-400 uppercase">🎉 En Çok Hediye Alan</p>
                    </div>
                    {giftsData.topReceivers.length === 0 ? (
                      <p className="text-gray-600 text-sm text-center py-8">Veri yok</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-800/50 text-gray-400 text-xs"><tr><th className="text-left p-3">Kullanıcı</th><th className="text-right p-3">Hediye</th><th className="text-right p-3">Coin</th></tr></thead>
                        <tbody className="divide-y divide-gray-800">
                          {giftsData.topReceivers.map((r, i) => (
                            <tr key={r.userId} className="hover:bg-gray-800/30 cursor-pointer" onClick={() => setSelectedUserId(r.userId)}>
                              <td className="p-3"><span className="text-gray-600 text-xs mr-2">{i + 1}.</span><span className="text-gray-200">{r.displayName ?? "—"}</span></td>
                              <td className="p-3 text-right text-emerald-300 font-bold">{r.gifts}</td>
                              <td className="p-3 text-right text-yellow-400 text-xs">{r.totalCoins.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════ RETENTION ═══════════════ */}
        {tab === "retention" && (
          <div className="space-y-6">
            <h2 className="text-xl font-black text-white">📈 Kullanıcı Tutma (Retention)</h2>
            {!retentionData ? (
              <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard label="Bugün Aktif (DAU)" value={retentionData.dau} icon="📅" color="indigo" sub="Eşleşme yapan" />
                  <StatCard label="Bu Hafta (WAU)" value={retentionData.wau} icon="📆" color="purple" sub="7 günlük" />
                  <StatCard label="Bu Ay (MAU)" value={retentionData.mau} icon="🗓️" color="orange" sub="30 günlük" />
                  <StatCard label="Ort. Sohbet Süresi" value={fmtDuration(retentionData.avgMatchDurationSecs)} icon="⏱️" color="emerald" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">📥 Yeni Kayıt (Son 30 Gün)</p>
                    {retentionData.newUsersByDay.length === 0 ? (
                      <p className="text-gray-600 text-xs text-center py-4">Veri yok</p>
                    ) : (
                      <MiniBar data={retentionData.newUsersByDay} color="#6366f1" height={56} />
                    )}
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">🎥 Günlük Aktif Kullanıcı (Son 30 Gün)</p>
                    {retentionData.activeByDay.length === 0 ? (
                      <p className="text-gray-600 text-xs text-center py-4">Veri yok</p>
                    ) : (
                      <MiniBar data={retentionData.activeByDay} color="#10b981" height={56} />
                    )}
                  </div>
                </div>

                {retentionData.dau > 0 && retentionData.mau > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">📊 Bağlılık Oranları</p>
                    <div className="space-y-3">
                      {[
                        { label: "DAU / MAU (Yapışkanlık)", value: retentionData.mau > 0 ? Math.round((retentionData.dau / retentionData.mau) * 100) : 0, color: "#6366f1" },
                        { label: "WAU / MAU", value: retentionData.mau > 0 ? Math.round((retentionData.wau / retentionData.mau) * 100) : 0, color: "#a855f7" },
                      ].map((m) => (
                        <div key={m.label} className="flex items-center gap-3">
                          <span className="text-xs text-gray-400 w-40 shrink-0">{m.label}</span>
                          <div className="flex-1 bg-gray-800 rounded-full h-2">
                            <div className="h-2 rounded-full" style={{ width: `${m.value}%`, backgroundColor: m.color }} />
                          </div>
                          <span className="text-xs font-bold text-gray-300 w-10 text-right">{m.value}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ═══════════════ PACKAGES ═══════════════ */}
        {tab === "packages" && (
          <div className="space-y-4 max-w-2xl">
            <h2 className="text-xl font-black text-white">📦 Coin Paketi Yönetimi</h2>
            <p className="text-sm text-gray-400">Paket bilgileri sunucu bellekte tutulur; sunucu yeniden başlatıldığında varsayılanlara döner.</p>

            {pkgMsg && (
              <div className={`px-4 py-2.5 rounded-xl text-sm font-semibold ${pkgMsg.ok ? "bg-emerald-900/50 border border-emerald-700 text-emerald-300" : "bg-red-900/50 border border-red-700 text-red-300"}`}>
                {pkgMsg.ok ? "✅" : "❌"} {pkgMsg.text}
              </div>
            )}

            <div className="space-y-2">
              {packages.map((pkg) => (
                <div key={pkg.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  {editingPkg === pkg.id ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-mono text-gray-500">{pkg.id}</span>
                        <button onClick={() => { setEditingPkg(null); setPkgMsg(null); }} className="ml-auto text-xs text-gray-500 hover:text-gray-300">✕ İptal</button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase">Etiket</label>
                          <input value={pkgLabel} onChange={(e) => setPkgLabel(e.target.value)} placeholder={pkg.label}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 mt-1" />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase">Coin Miktarı</label>
                          <input type="number" value={pkgCoins} onChange={(e) => setPkgCoins(e.target.value)} placeholder={String(pkg.coins)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 mt-1" />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase">Fiyat (Kuruş)</label>
                          <input type="number" value={pkgPrice} onChange={(e) => setPkgPrice(e.target.value)} placeholder={String(pkg.price)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 mt-1" />
                        </div>
                      </div>
                      <button onClick={async () => {
                        setPkgMsg(null);
                        const res = await apiFetch(`/api/admin/packages/${pkg.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ coins: pkgCoins ? Number(pkgCoins) : undefined, price: pkgPrice ? Number(pkgPrice) : undefined, label: pkgLabel || undefined }),
                        });
                        const d = await res.json() as { ok?: boolean; package?: CoinPackage; error?: string };
                        if (res.ok && d.ok && d.package) {
                          setPackages((prev) => prev.map((p) => p.id === pkg.id ? d.package! : p));
                          setPkgMsg({ ok: true, text: `${pkg.id} paketi güncellendi.` });
                          setEditingPkg(null); setPkgCoins(""); setPkgPrice(""); setPkgLabel("");
                        } else {
                          setPkgMsg({ ok: false, text: d.error ?? "Hata" });
                        }
                      }} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-xl font-semibold text-sm transition-colors">
                        💾 Kaydet
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-gray-200">{pkg.label}</span>
                          <span className="text-[10px] font-mono text-gray-600 bg-gray-800 px-2 py-0.5 rounded">{pkg.id}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-400">
                          <span>🪙 <strong className="text-yellow-400">{pkg.coins.toLocaleString("tr-TR")}</strong> coin</span>
                          <span>💰 <strong className="text-emerald-400">₺{(pkg.price / 100).toFixed(2)}</strong></span>
                          <span className="text-gray-600">{(pkg.coins / (pkg.price / 100)).toFixed(0)} coin/TL</span>
                        </div>
                      </div>
                      <button onClick={() => { setEditingPkg(pkg.id); setPkgCoins(String(pkg.coins)); setPkgPrice(String(pkg.price)); setPkgLabel(pkg.label); }}
                        className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-4 py-2 rounded-xl transition-colors">
                        ✏️ Düzenle
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════ HEALTH ═══════════════ */}
        {tab === "health" && (
          <div className="space-y-4 max-w-2xl">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-black text-white">🩺 Sistem Sağlığı</h2>
              <button onClick={() => {
                setHealthData(null); setHealthLoading(true);
                apiFetch("/api/admin/health").then((r) => r.json()).then((d: HealthData) => { setHealthData(d); setHealthLoading(false); });
              }} className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 px-3 py-1.5 rounded-lg transition-colors">
                🔄 Yenile
              </button>
            </div>

            {healthLoading || !healthData ? (
              <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <>
                <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl border ${healthData.status === "ok" ? "bg-emerald-900/30 border-emerald-700/50" : "bg-red-900/30 border-red-700/50"}`}>
                  <span className="text-3xl">{healthData.status === "ok" ? "✅" : "⚠️"}</span>
                  <div>
                    <p className="font-bold text-white text-lg">{healthData.status === "ok" ? "Sistem Sağlıklı" : "Sorun Tespit Edildi"}</p>
                    <p className="text-xs text-gray-400">{new Date(healthData.timestamp).toLocaleString("tr-TR")}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Çevrimiçi Kullanıcı", value: String(healthData.liveUsers), icon: "🟢", color: healthData.liveUsers > 0 ? "emerald" : "indigo" },
                    { label: "Sunucu Çalışma Süresi", value: `${Math.floor(healthData.uptimeSeconds / 3600)}s ${Math.floor((healthData.uptimeSeconds % 3600) / 60)}d`, icon: "⏱️", color: "indigo" },
                    { label: "Veritabanı", value: healthData.db.ok ? `${healthData.db.latencyMs}ms` : "Bağlantı Hatası", icon: "🗄️", color: healthData.db.ok ? "emerald" : "red" },
                    { label: "Node.js", value: healthData.nodeVersion, icon: "⚙️", color: "indigo" },
                  ].map((item) => (
                    <StatCard key={item.label} label={item.label} value={item.value} icon={item.icon} color={item.color} />
                  ))}
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">🧠 Bellek Kullanımı</p>
                  <div className="space-y-3">
                    {[
                      { label: "Heap Kullanılan", used: healthData.memory.heapUsedMb, total: healthData.memory.heapTotalMb, color: "#6366f1" },
                      { label: "RSS (Toplam)", used: healthData.memory.rssMb, total: Math.max(healthData.memory.rssMb, 512), color: "#a855f7" },
                    ].map((m) => (
                      <div key={m.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-400">{m.label}</span>
                          <span className="text-xs font-bold text-gray-300">{m.used} MB / {m.total} MB</span>
                        </div>
                        <div className="bg-gray-800 rounded-full h-2">
                          <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min((m.used / m.total) * 100, 100)}%`, backgroundColor: m.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-3">🔌 Servis Durumu</p>
                  <div className="space-y-2">
                    {[
                      { name: "API Server", ok: true },
                      { name: "PostgreSQL", ok: healthData.db.ok },
                      { name: "Socket.IO", ok: true },
                    ].map((s) => (
                      <div key={s.name} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                        <span className="text-sm text-gray-300">{s.name}</span>
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${s.ok ? "bg-emerald-900/60 text-emerald-300" : "bg-red-900/60 text-red-300"}`}>
                          {s.ok ? "● Çevrimiçi" : "● Hata"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Yayıncılar Tab ── */}
        {tab === "broadcasters" && (
          <div className="space-y-6 max-w-5xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">🎙️ Yayıncı Yönetimi</h2>
            </div>

            {bcMsg && (
              <div className={`px-4 py-3 rounded-lg text-sm font-medium ${bcMsg.ok ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700/40" : "bg-red-900/40 text-red-300 border border-red-700/40"}`}>
                {bcMsg.text}
              </div>
            )}

            {/* Yeni Yayıncı Formu */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
                {bcEditing ? "✏️ Yayıncı Düzenle" : "➕ Yeni Yayıncı Ekle"}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {!bcEditing && (
                  <input value={bcFormUserId} onChange={(e) => setBcFormUserId(e.target.value)} placeholder="User ID" className="col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                )}
                <input value={bcFormName} onChange={(e) => setBcFormName(e.target.value)} placeholder="Ad Soyad" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <input value={bcFormIban} onChange={(e) => setBcFormIban(e.target.value)} placeholder="TR... IBAN" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <input value={bcFormBank} onChange={(e) => setBcFormBank(e.target.value)} placeholder="Banka Adı (opsiyonel)" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <div className="flex gap-2">
                  <input value={bcFormRate} onChange={(e) => setBcFormRate(e.target.value)} placeholder="Kuruş/Coin (5)" type="number" className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <input value={bcFormCut} onChange={(e) => setBcFormCut(e.target.value)} placeholder="Platform kesinti %" type="number" className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <input value={bcFormNotes} onChange={(e) => setBcFormNotes(e.target.value)} placeholder="Notlar (opsiyonel)" className="col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={async () => {
                    const body = bcEditing
                      ? { fullName: bcFormName, iban: bcFormIban, bankName: bcFormBank, coinRateKurus: Number(bcFormRate), platformCutPercent: Number(bcFormCut), notes: bcFormNotes }
                      : { userId: bcFormUserId, fullName: bcFormName, iban: bcFormIban, bankName: bcFormBank, coinRateKurus: Number(bcFormRate), platformCutPercent: Number(bcFormCut), notes: bcFormNotes };
                    const url = bcEditing ? `/api/admin/broadcasters/${bcEditing}` : "/api/admin/broadcasters";
                    const method = bcEditing ? "PATCH" : "POST";
                    const r = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                    const d = await r.json() as { ok?: boolean; error?: string };
                    if (d.ok) {
                      setBcMsg({ ok: true, text: bcEditing ? "Yayıncı güncellendi." : "Yayıncı eklendi." });
                      setBcEditing(null); setBcFormUserId(""); setBcFormName(""); setBcFormIban(""); setBcFormBank(""); setBcFormRate("5"); setBcFormCut("50"); setBcFormNotes("");
                      apiFetch("/api/admin/broadcasters").then((r) => r.json()).then((d: { broadcasters: BroadcasterRow[] }) => setBroadcasters(d.broadcasters || []));
                    } else {
                      setBcMsg({ ok: false, text: d.error ?? "Hata" });
                    }
                  }}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {bcEditing ? "Güncelle" : "Yayıncı Ekle"}
                </button>
                {bcEditing && (
                  <button onClick={() => { setBcEditing(null); setBcFormName(""); setBcFormIban(""); setBcFormBank(""); setBcFormRate("5"); setBcFormCut("50"); setBcFormNotes(""); }} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors">İptal</button>
                )}
              </div>
            </div>

            {/* Yayıncı Listesi */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/50">
                  <tr>
                    {["Yayıncı", "IBAN / Banka", "Bu Hafta", "Toplam", "Oran", "Durum", "İşlem"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {broadcasters.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">Henüz yayıncı yok</td></tr>
                  )}
                  {broadcasters.map((bc) => {
                    const net = bc.coinRateKurus * (1 - bc.platformCutPercent / 100);
                    return (
                      <tr key={bc.userId} className="hover:bg-gray-800/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {bc.photoUrl && <img src={bc.photoUrl} className="w-7 h-7 rounded-full object-cover" />}
                            <div>
                              <p className="font-medium text-white text-xs">{bc.fullName}</p>
                              <p className="text-[10px] text-gray-500">{bc.displayName ?? bc.userId}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs text-white font-mono">{bc.iban.slice(0, 10)}…</p>
                          <p className="text-[10px] text-gray-500">{bc.bankName ?? "—"}</p>
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-amber-400">{bc.coinsThisWeek} 🪙</td>
                        <td className="px-4 py-3 text-xs text-gray-300">{bc.totalCoins} 🪙</td>
                        <td className="px-4 py-3 text-[10px] text-gray-400">{net.toFixed(1)} kr/coin<br />%{bc.platformCutPercent} kesinti</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={async () => {
                              await apiFetch(`/api/admin/broadcasters/${bc.userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !bc.isActive }) });
                              apiFetch("/api/admin/broadcasters").then((r) => r.json()).then((d: { broadcasters: BroadcasterRow[] }) => setBroadcasters(d.broadcasters || []));
                            }}
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${bc.isActive ? "bg-emerald-900/60 text-emerald-300" : "bg-red-900/60 text-red-300"}`}
                          >
                            {bc.isActive ? "Aktif" : "Pasif"}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => {
                              setBcEditing(bc.userId);
                              setBcFormName(bc.fullName);
                              setBcFormIban(bc.iban);
                              setBcFormBank(bc.bankName ?? "");
                              setBcFormRate(String(bc.coinRateKurus));
                              setBcFormCut(String(bc.platformCutPercent));
                              setBcFormNotes(bc.notes ?? "");
                            }}
                            className="text-xs text-indigo-400 hover:text-indigo-300"
                          >
                            Düzenle
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Haftalık Ödemeler Tab ── */}
        {tab === "earnings" && (
          <div className="space-y-6 max-w-5xl">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-xl font-bold text-white">💸 Haftalık Yayıncı Ödemeleri</h2>
              <button
                disabled={calcLoading}
                onClick={async () => {
                  setCalcLoading(true);
                  setEarningsMsg(null);
                  const r = await apiFetch("/api/admin/broadcasters/earnings/calculate", { method: "POST", headers: { "Content-Type": "application/json" } });
                  const d = await r.json() as { ok?: boolean; created?: number; weekStart?: string; error?: string };
                  setCalcLoading(false);
                  if (d.ok) {
                    setEarningsMsg({ ok: true, text: `Hesaplandı — ${d.created} yeni kayıt (Hafta: ${d.weekStart ? new Date(d.weekStart).toLocaleDateString("tr-TR") : ""})` });
                    apiFetch(`/api/admin/broadcasters/earnings?status=${earningsStatus}`).then((r) => r.json()).then((d: { earnings: EarningRow[] }) => setEarnings(d.earnings || []));
                  } else {
                    setEarningsMsg({ ok: false, text: d.error ?? "Hata" });
                  }
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {calcLoading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "🔄"}
                Haftalık Kazanç Hesapla
              </button>
            </div>

            {earningsMsg && (
              <div className={`px-4 py-3 rounded-lg text-sm font-medium ${earningsMsg.ok ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700/40" : "bg-red-900/40 text-red-300 border border-red-700/40"}`}>
                {earningsMsg.text}
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              {["pending", "paid", "cancelled"].map((s) => (
                <button key={s} onClick={() => setEarningsStatus(s)} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${earningsStatus === s ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                  {s === "pending" ? "⏳ Bekleyen" : s === "paid" ? "✅ Ödendi" : "❌ İptal"}
                </button>
              ))}
            </div>

            {payNoteId !== null && (
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex gap-3 items-center">
                <input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Ödeme notu (opsiyonel)" className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <button
                  onClick={async () => {
                    await apiFetch(`/api/admin/broadcasters/earnings/${payNoteId}/pay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: payNote }) });
                    setPayNoteId(null); setPayNote("");
                    setEarningsMsg({ ok: true, text: "Ödeme onaylandı." });
                    apiFetch(`/api/admin/broadcasters/earnings?status=${earningsStatus}`).then((r) => r.json()).then((d: { earnings: EarningRow[] }) => setEarnings(d.earnings || []));
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors"
                >Onayla</button>
                <button onClick={() => { setPayNoteId(null); setPayNote(""); }} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors">İptal</button>
              </div>
            )}

            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/50">
                  <tr>
                    {["Yayıncı", "Hafta", "Coin", "Tutar (TL)", "Durum", "İşlemler"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {earnings.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">Kayıt bulunamadı</td></tr>
                  )}
                  {earnings.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-800/30">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-white">{e.fullName}</p>
                        <p className="text-[10px] text-gray-500 font-mono">{e.iban.slice(0, 10)}… {e.bankName ?? ""}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-300">
                        {new Date(e.weekStart).toLocaleDateString("tr-TR")} — {new Date(e.weekEnd).toLocaleDateString("tr-TR")}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-amber-400">{e.totalCoins} 🪙</td>
                      <td className="px-4 py-3 text-sm font-bold text-white">
                        {(e.totalTlKurus / 100).toFixed(2)} ₺
                        {e.paymentNote && <p className="text-[10px] text-gray-500 font-normal">{e.paymentNote}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${e.status === "paid" ? "bg-emerald-900/60 text-emerald-300" : e.status === "cancelled" ? "bg-red-900/60 text-red-300" : "bg-amber-900/60 text-amber-300"}`}>
                          {e.status === "paid" ? "✅ Ödendi" : e.status === "cancelled" ? "❌ İptal" : "⏳ Bekliyor"}
                        </span>
                        {e.paidAt && <p className="text-[10px] text-gray-500 mt-0.5">{new Date(e.paidAt).toLocaleDateString("tr-TR")}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {e.status === "pending" && (
                          <div className="flex gap-2">
                            <button onClick={() => { setPayNoteId(e.id); setPayNote(""); }} className="text-xs px-2.5 py-1 bg-emerald-700/40 hover:bg-emerald-700/60 text-emerald-300 rounded-lg transition-colors">Öde</button>
                            <button
                              onClick={async () => {
                                await apiFetch(`/api/admin/broadcasters/earnings/${e.id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" } });
                                setEarningsMsg({ ok: true, text: "İptal edildi." });
                                apiFetch(`/api/admin/broadcasters/earnings?status=${earningsStatus}`).then((r) => r.json()).then((d: { earnings: EarningRow[] }) => setEarnings(d.earnings || []));
                              }}
                              className="text-xs px-2.5 py-1 bg-red-700/40 hover:bg-red-700/60 text-red-300 rounded-lg transition-colors"
                            >İptal</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>

      {/* ── User Detail Modal ── */}
      {selectedUserId && (
        <UserModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} onBan={ban} onRefreshStats={refreshStats} />
      )}
    </div>
  );
}
