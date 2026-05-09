import { useCallback, useEffect, useState } from "react";

type Period = "daily" | "weekly" | "all-time";
type Kind = "senders" | "receivers";

interface LbRow {
  rank: number;
  userId: string;
  total: number;
  displayName: string;
  photoUrl: string | null;
  country: string | null;
  vipPlan: "bronze" | "silver" | "gold" | null;
}
interface LbResponse {
  rows: LbRow[];
  myRank: number | null;
  myTotal: number;
}

const VIP_BADGE: Record<string, string> = { bronze: "🥉", silver: "🥈", gold: "🥇" };

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>("weekly");
  const [kind, setKind] = useState<Kind>("senders");
  const [data, setData] = useState<LbResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?period=${period}&kind=${kind}`, { credentials: "include" });
      if (res.ok) setData((await res.json()) as LbResponse);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [period, kind]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#1e1b4b 0%,#0f172a 100%)", color: "#fff", padding: "24px 16px", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <a href="/" style={{ color: "#fff", textDecoration: "none", fontSize: 14 }}>← Geri</a>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>🏆 Lider Tablosu</h1>
          <span style={{ width: 50 }} />
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {(["senders", "receivers"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                background: kind === k ? "#a78bfa" : "rgba(255,255,255,0.08)",
                color: kind === k ? "#1e1b4b" : "rgba(255,255,255,0.7)",
                fontWeight: 700,
                fontSize: 13,
                border: "none",
                cursor: "pointer",
              }}
            >
              {k === "senders" ? "🎁 Gönderenler" : "💝 Alanlar"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {(["daily", "weekly", "all-time"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 8,
                background: period === p ? "rgba(167,139,250,0.3)" : "rgba(255,255,255,0.04)",
                color: period === p ? "#fff" : "rgba(255,255,255,0.5)",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
              }}
            >
              {p === "daily" ? "Bugün" : p === "weekly" ? "Hafta" : "Tüm Zamanlar"}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.5)" }}>Yükleniyor…</div>
        ) : !data || data.rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 48 }}>🌱</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>Henüz veri yok</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>
              İlk hediyeyi sen gönder ve sıralamada yerini al!
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.rows.map((row) => {
              const medal = row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : null;
              return (
                <div key={row.userId} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  borderRadius: 12,
                  background: row.rank <= 3 ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.05)",
                  border: row.rank <= 3 ? "1px solid rgba(251,191,36,0.3)" : "none",
                }}>
                  <div style={{ width: 36, textAlign: "center" }}>
                    {medal ? <span style={{ fontSize: 22 }}>{medal}</span>
                      : <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 800, fontSize: 16 }}>{row.rank}</span>}
                  </div>
                  <div style={{
                    width: 40, height: 40, borderRadius: 20, background: "#7c3aed",
                    display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
                  }}>
                    {row.photoUrl
                      ? <img src={row.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ color: "#fff", fontWeight: 800 }}>{row.displayName.charAt(0).toUpperCase()}</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {row.displayName}{row.vipPlan ? ` ${VIP_BADGE[row.vipPlan]}` : ""}
                    </div>
                    {row.country && <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{row.country}</div>}
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "5px 10px", borderRadius: 10, background: "rgba(251,191,36,0.15)",
                  }}>
                    <span style={{ color: "#fbbf24", fontWeight: 800, fontSize: 13 }}>🏆 {row.total.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}

            {data.myRank !== null && data.myRank > data.rows.length && (
              <div style={{
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 12,
                borderRadius: 12,
                background: "rgba(167,139,250,0.18)",
                border: "1px solid rgba(167,139,250,0.4)",
              }}>
                <div style={{ width: 36, textAlign: "center", fontWeight: 800 }}>{data.myRank}</div>
                <div style={{ flex: 1, fontWeight: 700 }}>Sen</div>
                <div style={{ color: "#fbbf24", fontWeight: 800, fontSize: 13 }}>🏆 {data.myTotal.toLocaleString()}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
