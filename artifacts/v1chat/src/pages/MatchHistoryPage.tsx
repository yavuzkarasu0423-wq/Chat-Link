import { useEffect, useState } from "react";

interface Match {
  id: number;
  peerId: string;
  displayName: string;
  photoUrl: string | null;
  createdAt: string;
  durationSeconds: number;
}
interface Resp {
  matches: Match[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

function fmtDur(s: number) {
  if (s < 60) return `${s} sn`;
  return `${Math.floor(s / 60)} dk ${s % 60} sn`;
}

export default function MatchHistoryPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async (off: number) => {
    setLoading(true);
    const r = await fetch(`/api/matches?limit=20&offset=${off}`, { credentials: "include" });
    if (r.ok) {
      const d = (await r.json()) as Resp;
      setMatches((prev) => (off === 0 ? d.matches : [...prev, ...d.matches]));
      setOffset(off + d.matches.length);
      setHasMore(d.hasMore);
    }
    setLoading(false);
  };

  useEffect(() => { void load(0); }, []);

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <a href={import.meta.env.BASE_URL} style={{ color: "#7c3aed", textDecoration: "none", fontSize: 13 }}>← Ana sayfa</a>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: "12px 0 18px" }}>📜 Eşleşme Geçmişi</h1>

      {matches.length === 0 && !loading && (
        <p style={{ color: "#9ca3af" }}>Henüz görüşme yok. İlk eşleşmen için video sohbete başla!</p>
      )}

      {matches.map((m) => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ width: 44, height: 44, borderRadius: 999, background: "#f3f4f6", overflow: "hidden", flexShrink: 0 }}>
            {m.photoUrl ? <img src={m.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{m.displayName}</div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>
              {new Date(m.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
            </div>
          </div>
          <div style={{ fontSize: 13, color: "#10b981", fontWeight: 700 }}>{fmtDur(m.durationSeconds)}</div>
        </div>
      ))}

      {hasMore && (
        <button onClick={() => void load(offset)} disabled={loading} style={{
          width: "100%", padding: "12px 16px", marginTop: 16, borderRadius: 10,
          background: "#7c3aed", color: "#fff", fontWeight: 700, border: "none", cursor: "pointer",
        }}>{loading ? "Yükleniyor…" : "Daha fazla"}</button>
      )}
    </div>
  );
}
