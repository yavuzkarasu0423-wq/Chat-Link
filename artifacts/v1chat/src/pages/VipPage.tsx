import { useEffect, useState } from "react";

type VipPlanId = "bronze" | "silver" | "gold";
interface PlanDef {
  id: VipPlanId;
  name: string;
  priceTry: number;
  monthlyCoins: number;
  perks: string[];
}
interface PlansResponse { plans: PlanDef[]; stripeEnabled: boolean }
interface MeResponse {
  active: boolean;
  plan: VipPlanId | null;
  status: string | null;
  currentPeriodEnd: string | null;
}

const PLAN_ICON: Record<VipPlanId, string> = { bronze: "🥉", silver: "🥈", gold: "🥇" };
const PLAN_GRADIENT: Record<VipPlanId, string> = {
  bronze: "linear-gradient(135deg,#92400e,#b45309)",
  silver: "linear-gradient(135deg,#475569,#64748b)",
  gold:   "linear-gradient(135deg,#a16207,#ca8a04)",
};

export default function VipPage() {
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<VipPlanId | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [p, m] = await Promise.all([
          fetch("/api/subscription/plans", { credentials: "include" }),
          fetch("/api/subscription/me", { credentials: "include" }),
        ]);
        if (p.ok) setPlans((await p.json()) as PlansResponse);
        if (m.ok) setMe((await m.json()) as MeResponse);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const handleBuy = async (planId: VipPlanId) => {
    if (!plans?.stripeEnabled) {
      alert("VIP ödemeler henüz aktif değil. Yakında!");
      return;
    }
    setBusy(planId);
    try {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        alert(err.error ?? "Ödeme başlatılamadı");
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (data.url) window.location.href = data.url;
    } finally {
      setBusy(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Aboneliğini dönem sonunda iptal etmek istiyor musun?")) return;
    const res = await fetch("/api/subscription/cancel", {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) alert("Aboneliğin dönem sonunda iptal edilecek.");
    else alert("İptal başarısız.");
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#1e1b4b 0%,#0f172a 100%)", color: "#fff", padding: "24px 16px", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <a href="/" style={{ color: "#fff", textDecoration: "none", fontSize: 14 }}>← Geri</a>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>👑 VIP Üyelik</h1>
          <span style={{ width: 50 }} />
        </div>

        {me?.active && me.plan && (
          <div style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", padding: 14, borderRadius: 12, marginBottom: 20 }}>
            <div style={{ fontWeight: 800, color: "#86efac" }}>
              ✓ Aktif Plan: {PLAN_ICON[me.plan]} {me.plan.toUpperCase()}
            </div>
            {me.currentPeriodEnd && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                Yenilenme: {new Date(me.currentPeriodEnd).toLocaleDateString("tr-TR")}
              </div>
            )}
            <button onClick={handleCancel} style={{ marginTop: 8, background: "transparent", border: "none", color: "#fca5a5", textDecoration: "underline", cursor: "pointer", fontSize: 12, padding: 0 }}>
              Aboneliği iptal et
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 60 }}>Yükleniyor…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
            {plans?.plans.map((plan) => {
              const isCurrent = me?.active && me.plan === plan.id;
              return (
                <div key={plan.id} style={{ borderRadius: 18, overflow: "hidden", background: "rgba(255,255,255,0.05)" }}>
                  <div style={{ background: PLAN_GRADIENT[plan.id], padding: 20, textAlign: "center" }}>
                    <div style={{ fontSize: 36 }}>{PLAN_ICON[plan.id]}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>{plan.name}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>
                      ₺{plan.priceTry}<span style={{ fontSize: 14, fontWeight: 500, opacity: 0.7 }}> / ay</span>
                    </div>
                  </div>
                  <div style={{ padding: 16 }}>
                    {plan.perks.map((perk, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, fontSize: 13 }}>
                        <span style={{ color: "#22c55e" }}>✓</span>
                        <span style={{ color: "rgba(255,255,255,0.85)" }}>{perk}</span>
                      </div>
                    ))}
                    <button
                      disabled={Boolean(isCurrent) || busy !== null}
                      onClick={() => handleBuy(plan.id)}
                      style={{
                        width: "100%",
                        marginTop: 12,
                        padding: "14px 16px",
                        borderRadius: 10,
                        background: isCurrent ? "rgba(255,255,255,0.1)" : "#a855f7",
                        color: "#fff",
                        fontWeight: 800,
                        fontSize: 14,
                        border: "none",
                        cursor: isCurrent ? "default" : "pointer",
                      }}
                    >
                      {busy === plan.id ? "..." : isCurrent ? "Aktif Plan" : "Şimdi Yükselt"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {plans && !plans.stripeEnabled && (
          <p style={{ marginTop: 20, color: "rgba(255,255,255,0.5)", fontSize: 12, textAlign: "center" }}>
            ℹ️ VIP ödemeler henüz aktif değil. Stripe yapılandırması tamamlandığında devreye girecek.
          </p>
        )}
      </div>
    </div>
  );
}
