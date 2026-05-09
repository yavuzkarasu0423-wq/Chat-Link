import { useEffect, useState } from "react";

interface Recent {
  userId: string;
  displayName: string;
  photoUrl: string | null;
  joinedAt: string;
}
interface Resp {
  code: string;
  link: string;
  rewardCoins: number;
  totalReferred: number;
  coinsEarned: number;
  recent: Recent[];
}

export default function ReferralPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = async () => {
    const r = await fetch("/api/referral/me", { credentials: "include" });
    if (r.ok) setData((await r.json()) as Resp);
  };

  useEffect(() => {
    void refresh();
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) setCode(ref);
  }, []);

  const copy = async () => {
    if (!data?.link) return;
    await navigator.clipboard.writeText(data.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const claim = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/referral/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: code.trim() }),
      });
      const j = await r.json();
      if (r.ok) {
        setMsg({ type: "ok", text: `🎉 ${j.reward} coin kazandın!` });
        setCode("");
        void refresh();
      } else {
        setMsg({ type: "err", text: j.error ?? "İşlem başarısız" });
      }
    } catch {
      setMsg({ type: "err", text: "Ağ hatası" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", maxWidth: 640, margin: "0 auto", padding: 20 }}>
      <a href={import.meta.env.BASE_URL} style={{ color: "#7c3aed", textDecoration: "none", fontSize: 13 }}>← Ana sayfa</a>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: "12px 0 4px" }}>🎁 Arkadaşını Davet Et</h1>
      <p style={{ color: "#6b7280", margin: "0 0 18px" }}>
        Sen ve davet ettiğin arkadaşın, herkes <b>{data?.rewardCoins ?? 100} coin</b> kazanır.
      </p>

      <div style={{ background: "linear-gradient(135deg,#10b981,#84cc16)", padding: 18, borderRadius: 14, color: "#fff", marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.85 }}>Davet linkin</div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <input readOnly value={data?.link ?? ""} style={{
            flex: 1, padding: "10px 12px", borderRadius: 8, border: "none",
            fontSize: 13, color: "#111827",
          }} />
          <button onClick={copy} style={{
            padding: "10px 16px", borderRadius: 8, background: "#fff",
            color: "#10b981", fontWeight: 800, border: "none", cursor: "pointer",
          }}>{copied ? "✓" : "Kopyala"}</button>
        </div>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 10 }}>
          Davet kodun: <b style={{ fontFamily: "monospace" }}>{data?.code ?? "…"}</b>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        <div style={{ background: "#f9fafb", padding: 14, borderRadius: 12, textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{data?.totalReferred ?? 0}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Davet edilen</div>
        </div>
        <div style={{ background: "#f9fafb", padding: 14, borderRadius: 12, textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#10b981" }}>+{data?.coinsEarned ?? 0}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Coin kazancı</div>
        </div>
      </div>

      <div style={{ background: "#fffbeb", padding: 14, borderRadius: 12, marginBottom: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Bir davet kodun mu var?</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Davet kodunu yapıştır" style={{
            flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #fde68a", fontSize: 13,
          }} />
          <button onClick={claim} disabled={busy || !code.trim()} style={{
            padding: "10px 16px", borderRadius: 8, background: "#f59e0b",
            color: "#451a03", fontWeight: 800, border: "none", cursor: "pointer", opacity: busy ? 0.6 : 1,
          }}>{busy ? "…" : "Kullan"}</button>
        </div>
        {msg && (
          <div style={{ marginTop: 10, fontSize: 13, color: msg.type === "ok" ? "#059669" : "#dc2626" }}>
            {msg.text}
          </div>
        )}
      </div>

      {data?.recent && data.recent.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#6b7280", margin: "8px 0" }}>Son davetler</h2>
          {data.recent.map((r) => (
            <div key={r.userId} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ width: 36, height: 36, borderRadius: 999, background: "#f3f4f6", overflow: "hidden", flexShrink: 0 }}>
                {r.photoUrl ? <img src={r.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
              </div>
              <div style={{ flex: 1 }}>{r.displayName}</div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>{new Date(r.joinedAt).toLocaleDateString("tr-TR")}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
