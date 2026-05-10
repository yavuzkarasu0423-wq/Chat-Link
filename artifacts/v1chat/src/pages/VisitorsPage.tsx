import { useEffect, useState } from "react";

interface Visitor {
  userId: string;
  displayName: string;
  photoUrl: string | null;
  country: string | null;
  age: number | null;
  visitCount: number;
  lastVisitedAt: string;
}
interface Resp {
  vip: boolean;
  totalVisitors: number;
  visitors: Visitor[];
  message?: string;
}

function fmtAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

export default function VisitorsPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/profile-visits", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d as Resp | null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <a href={import.meta.env.BASE_URL} style={{ color: "#7c3aed", textDecoration: "none", fontSize: 13 }}>← Ana sayfa</a>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: "12px 0 6px" }}>👀 Profilini Ziyaret Edenler</h1>
      <p style={{ color: "#6b7280", margin: "0 0 18px" }}>Toplam <b>{data?.totalVisitors ?? 0}</b> ziyaret</p>

      {loading && <p>Yükleniyor…</p>}
      {!loading && data && !data.vip && (
        <div style={{ background: "linear-gradient(135deg,#581c87,#7c3aed)", color: "#fff", padding: 22, borderRadius: 14, textAlign: "center" }}>
          <div style={{ fontSize: 38 }}>👑</div>
          <div style={{ fontWeight: 800, fontSize: 17, margin: "6px 0" }}>{data.message}</div>
          <a href={`${import.meta.env.BASE_URL}vip`} style={{
            display: "inline-block", marginTop: 10, padding: "10px 20px", borderRadius: 999,
            background: "#fbbf24", color: "#451a03", fontWeight: 800, textDecoration: "none",
          }}>VIP'i Keşfet</a>
        </div>
      )}

      {!loading && data?.vip && data.visitors.length === 0 && (
        <p style={{ color: "#9ca3af" }}>Henüz seni ziyaret eden yok.</p>
      )}

      {!loading && data?.vip && data.visitors.map((v) => (
        <div key={v.userId} style={{
          display: "flex", alignItems: "center", gap: 12, padding: 12,
          borderBottom: "1px solid #f3f4f6",
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 999, overflow: "hidden",
            background: "#f3f4f6", flexShrink: 0,
          }}>
            {v.photoUrl ? <img src={v.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{v.displayName}{v.age ? `, ${v.age}` : ""}</div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>
              {v.country ?? "—"} • {v.visitCount} kez ziyaret • {fmtAgo(v.lastVisitedAt)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
