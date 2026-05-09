import { useCallback, useEffect, useState } from "react";

interface Status {
  currentStreak: number;
  canClaim: boolean;
  hoursUntilNext: number;
  nextStreak: number;
  nextReward: number;
  ladder: number[];
}

interface Props {
  /** Called with the new coin balance after a successful claim */
  onClaimed?: (reward: number, balance: number) => void;
  /** Hide entirely if user is not authenticated (returns 401) */
  authed?: boolean;
}

/**
 * Compact daily-reward widget. Shows the 7-day ladder and a claim button when available.
 * Silently hides itself if the API returns 401 or errors.
 */
export default function DailyRewardBanner({ onClaimed, authed = true }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [hidden, setHidden] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/daily-reward/status", { credentials: "include" });
      if (res.status === 401) { setHidden(true); return; }
      if (res.ok) setStatus((await res.json()) as Status);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!authed) { setHidden(true); return; }
    void refresh();
  }, [authed, refresh]);

  const handleClaim = async () => {
    if (!status?.canClaim || claiming) return;
    setClaiming(true);
    try {
      const res = await fetch("/api/daily-reward/claim", { method: "POST", credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as { reward: number; balance: number };
        onClaimed?.(data.reward, data.balance);
        await refresh();
      }
    } catch { /* ignore */ }
    finally { setClaiming(false); }
  };

  if (hidden || !status) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={status.canClaim ? "Günlük ödülünü al!" : `Sonraki ödül ${status.hoursUntilNext} saat sonra`}
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 999,
          background: status.canClaim
            ? "linear-gradient(135deg,#fbbf24,#f59e0b)"
            : "rgba(124,58,237,0.18)",
          color: status.canClaim ? "#451a03" : "#c4b5fd",
          fontWeight: 700,
          fontSize: 13,
          border: "none",
          cursor: "pointer",
        }}
      >
        🗓️ {status.currentStreak} gün
        {status.canClaim && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            width: 10, height: 10, borderRadius: 5, background: "#ef4444",
            border: "2px solid #fff",
          }} />
        )}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "linear-gradient(135deg,#581c87,#7c3aed)",
              padding: 20, borderRadius: 18, maxWidth: 420, width: "100%",
              color: "#fff", boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>🗓️ Günlük Ödül</h2>
              <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 700 }}>
                {status.currentStreak} gün üst üste 🔥
              </span>
            </div>

            <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
              {status.ladder.map((amount, i) => {
                const day = i + 1;
                const claimed = day <= status.currentStreak;
                const isNext = status.canClaim && day === ((status.currentStreak % status.ladder.length) + 1);
                return (
                  <div key={day} style={{
                    flex: 1,
                    padding: "8px 4px",
                    borderRadius: 8,
                    textAlign: "center",
                    background: isNext ? "rgba(251,191,36,0.4)" : claimed ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)",
                    border: isNext ? "1px solid #fbbf24" : "none",
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: claimed || isNext ? "#fff" : "rgba(255,255,255,0.5)" }}>
                      {day}.
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 800, marginTop: 2, color: claimed || isNext ? "#fff" : "rgba(255,255,255,0.7)" }}>
                      {amount}
                    </div>
                  </div>
                );
              })}
            </div>

            {status.canClaim ? (
              <button
                onClick={handleClaim}
                disabled={claiming}
                style={{
                  width: "100%", padding: "14px 16px", borderRadius: 12,
                  background: "#fbbf24", color: "#581c87", fontWeight: 800, fontSize: 15,
                  border: "none", cursor: "pointer",
                }}
              >
                {claiming ? "..." : `🎁 Bugünkü ${status.nextReward} coin'i al`}
              </button>
            ) : (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: 13, padding: "10px 0" }}>
                ⏰ Sonraki ödül {status.hoursUntilNext} saat sonra ({status.nextReward} coin)
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
