import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  getGiftConfig,
  playGiftTone,
  triggerHaptic,
  RARITY_LABEL,
  RARITY_GRADIENT,
  type GiftConfig,
} from "../lib/gift-effects";

function Twemoji({ emoji, size = 48 }: { emoji: string; size?: number }) {
  return (
    <span
      style={{
        fontSize: size,
        lineHeight: 1,
        display: "inline-block",
        fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif',
      }}
    >
      {emoji}
    </span>
  );
}

interface PushArg {
  emoji: string;
  senderName: string;
  side: "me" | "partner";
}

export interface GiftOverlayHandle {
  push: (e: PushArg) => void;
}

interface ActiveGift {
  id: string;
  cfg: GiftConfig;
  senderName: string;
  side: "me" | "partner";
  startedAt: number;
  combo: number;
  endsAt: number;
  particles: Particle[];
  shakeKey: number;
}

interface Particle {
  i: number;
  // direction in radians
  angle: number;
  // outward distance
  distance: number;
  // animation duration ms
  dur: number;
  delay: number;
  size: number;
  color: string;
  emoji?: string;
  // for falling petals
  drift: number;
  rotate: number;
}

const COMBO_WINDOW = 2500;

function makeParticles(cfg: GiftConfig, comboBoost: number): Particle[] {
  const baseCount = Math.min(60, Math.floor(cfg.particleCount * (1 + comboBoost * 0.25)));
  const useEmojis = cfg.particleEmojis && cfg.particleEmojis.length > 0;
  const arr: Particle[] = [];
  for (let i = 0; i < baseCount; i++) {
    const angle = (i / baseCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    const distance = 70 + Math.random() * (110 + comboBoost * 30);
    const color = cfg.particleColors[i % cfg.particleColors.length];
    const emoji = useEmojis ? cfg.particleEmojis![i % cfg.particleEmojis!.length] : undefined;
    arr.push({
      i,
      angle,
      distance,
      dur: 900 + Math.random() * 1400,
      delay: Math.random() * 220,
      size: emoji ? 18 + Math.random() * 14 : 7 + Math.random() * 7,
      color,
      emoji,
      drift: (Math.random() - 0.5) * 80,
      rotate: (Math.random() - 0.5) * 720,
    });
  }
  return arr;
}

export const GiftOverlay = forwardRef<GiftOverlayHandle>(function GiftOverlay(_, ref) {
  const [active, setActive] = useState<ActiveGift[]>([]);
  const activeRef = useRef<ActiveGift[]>([]);
  useEffect(() => { activeRef.current = active; }, [active]);

  const cleanupTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const scheduleRemoval = useCallback((id: string, when: number) => {
    const existing = cleanupTimers.current.get(id);
    if (existing) clearTimeout(existing);
    const ms = Math.max(200, when - Date.now());
    const t = setTimeout(() => {
      setActive((arr) => arr.filter((g) => g.id !== id));
      cleanupTimers.current.delete(id);
    }, ms);
    cleanupTimers.current.set(id, t);
  }, []);

  const push = useCallback((e: PushArg) => {
    const cfg = getGiftConfig(e.emoji);
    const now = Date.now();

    // Combo: same emoji from same side in window → bump existing
    const existing = activeRef.current.find(
      (g) => g.cfg.emoji === e.emoji && g.side === e.side && now - g.startedAt < COMBO_WINDOW
    );
    if (existing) {
      const newCombo = existing.combo + 1;
      const extendedEnd = now + cfg.duration;
      setActive((arr) =>
        arr.map((g) =>
          g.id === existing.id
            ? {
                ...g,
                combo: newCombo,
                startedAt: now,
                endsAt: extendedEnd,
                particles: makeParticles(cfg, Math.min(8, Math.log2(newCombo + 1))),
                shakeKey: g.shakeKey + 1,
              }
            : g
        )
      );
      scheduleRemoval(existing.id, extendedEnd + 400);
      playGiftTone(cfg, newCombo);
      triggerHaptic(cfg.haptic);
      return;
    }

    // New active gift
    const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
    const ag: ActiveGift = {
      id,
      cfg,
      senderName: e.senderName,
      side: e.side,
      startedAt: now,
      combo: 1,
      endsAt: now + cfg.duration,
      particles: makeParticles(cfg, 0),
      shakeKey: 0,
    };
    setActive((arr) => [...arr, ag]);
    scheduleRemoval(id, ag.endsAt + 400);
    playGiftTone(cfg, 1);
    triggerHaptic(cfg.haptic);
  }, [scheduleRemoval]);

  useImperativeHandle(ref, () => ({ push }), [push]);

  useEffect(() => {
    return () => {
      cleanupTimers.current.forEach((t) => clearTimeout(t));
      cleanupTimers.current.clear();
    };
  }, []);

  // any active legendary or shake gift triggers screen shake on the wrapper
  const anyShake = active.some((g) => g.cfg.shake);
  const anyFullscreen = active.find((g) => g.cfg.fullscreen);

  return (
    <div
      className="absolute inset-0 pointer-events-none z-40 overflow-hidden"
      style={anyShake ? { animation: "giftScreenShake 0.7s ease-out" } : undefined}
    >
      {/* Legendary cinematic background */}
      {anyFullscreen && (
        <div
          key={anyFullscreen.id + "-bg"}
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(circle at 50% 50%, ${anyFullscreen.cfg.glow} 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.65) 100%)`,
            animation: "giftCinematicBg 1.6s ease-out forwards",
            mixBlendMode: "screen",
          }}
        />
      )}

      {active.map((g) => (
        <GiftEffect key={g.id} gift={g} />
      ))}

      {/* Sender banner stack (top of overlay) */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-50">
        {active.map((g) => (
          <SenderBanner key={g.id + "-banner"} gift={g} />
        ))}
      </div>
    </div>
  );
});

function SenderBanner({ gift }: { gift: ActiveGift }) {
  const { cfg, senderName, combo, side } = gift;
  const milestone = combo >= 100 ? "x100 EFSANE!" : combo >= 50 ? "x50 ÇILGIN!" : combo >= 10 ? "x10 KOMBO!" : null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 16px 8px 10px",
        borderRadius: 999,
        background: "rgba(15,15,25,0.55)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: `1px solid ${cfg.primary}55`,
        boxShadow: `0 6px 28px ${cfg.glow}, inset 0 0 0 1px rgba(255,255,255,0.06)`,
        animation: "giftBannerIn 0.45s cubic-bezier(0.34,1.56,0.64,1)",
        maxWidth: "92vw",
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          background: RARITY_GRADIENT[cfg.rarity],
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: `0 0 12px ${cfg.glow}`,
        }}
      >
        <Twemoji emoji={cfg.emoji} size={18} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#fff",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 180,
          }}
        >
          {side === "me" ? "Sen" : senderName}
          <span style={{ color: cfg.secondary, fontWeight: 500 }}> → {cfg.name}</span>
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: 600, letterSpacing: 0.4 }}>
          {RARITY_LABEL[cfg.rarity].toUpperCase()}
        </div>
      </div>
      {combo > 1 && (
        <div
          key={combo}
          style={{
            marginLeft: 4,
            padding: "2px 10px",
            borderRadius: 999,
            background: `linear-gradient(135deg, ${cfg.primary}, ${cfg.secondary})`,
            color: "#fff",
            fontWeight: 900,
            fontSize: 14,
            textShadow: "0 1px 2px rgba(0,0,0,0.4)",
            animation: "giftComboPop 0.42s cubic-bezier(0.34,1.56,0.64,1)",
            boxShadow: `0 0 14px ${cfg.glow}`,
          }}
        >
          x{combo}
        </div>
      )}
      {milestone && (
        <div
          key={`m-${combo}`}
          style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginTop: 6,
            padding: "4px 14px",
            borderRadius: 999,
            background: RARITY_GRADIENT.legendary,
            color: "#fff",
            fontWeight: 900,
            fontSize: 12,
            letterSpacing: 1,
            whiteSpace: "nowrap",
            animation: "giftMilestonePop 1.2s ease-out forwards",
            boxShadow: "0 6px 22px rgba(245,158,11,0.55)",
          }}
        >
          ⚡ {milestone}
        </div>
      )}
    </div>
  );
}

function GiftEffect({ gift }: { gift: ActiveGift }) {
  const { cfg, particles, shakeKey, combo } = gift;
  const sizeBoost = Math.min(2.2, 1 + Math.log2(combo + 1) * 0.18);
  const emojiSize = Math.round((cfg.fullscreen ? 110 : 78) * sizeBoost);

  // Some effects use special main emoji animation
  const mainAnim = (() => {
    switch (cfg.effect) {
      case "rocket":
        return "giftRocketBlast 1.6s cubic-bezier(0.5,0,0.5,1) forwards";
      case "plane":
        return "giftPlaneFly 2.2s cubic-bezier(0.4,0,0.6,1) forwards";
      case "ring":
      case "diamond":
        return "giftRingZoom 0.9s cubic-bezier(0.34,1.56,0.64,1) forwards";
      case "crown":
        return "giftCrownDescend 1.2s cubic-bezier(0.34,1.56,0.64,1) forwards";
      case "teddy":
        return "giftTeddyBounce 1.4s cubic-bezier(0.34,1.7,0.64,1) forwards";
      case "broken":
        return "giftBrokenFall 1.6s cubic-bezier(0.4,0,0.6,1) forwards";
      case "bomb":
        return "giftBombExplode 0.8s cubic-bezier(0.34,1.7,0.64,1) forwards";
      case "peach":
        return "giftPeachBounce 1.2s cubic-bezier(0.34,1.7,0.64,1) forwards";
      case "cool":
        return "giftCoolSlide 1s cubic-bezier(0.34,1.56,0.64,1) forwards";
      default:
        return "giftPop 0.65s cubic-bezier(0.34,1.56,0.64,1) forwards";
    }
  })();

  // Burst ring color & whether to show
  const showRing = cfg.effect !== "rose" && cfg.effect !== "petals";

  // Particle render mode per effect
  const partMode: "burst" | "fall" | "rise" = (() => {
    if (cfg.effect === "rose" || cfg.effect === "petals") return "fall";
    if (cfg.effect === "music") return "rise";
    return "burst";
  })();

  return (
    <>
      {/* Glow halo behind everything */}
      <div
        key={`halo-${shakeKey}`}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: emojiSize * 3.4,
          height: emojiSize * 3.4,
          marginLeft: -(emojiSize * 1.7),
          marginTop: -(emojiSize * 1.7),
          background: `radial-gradient(circle, ${cfg.glow} 0%, transparent 65%)`,
          animation: "giftGlowPulse 1.4s ease-out forwards",
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />

      {/* Burst ring */}
      {showRing && (
        <div
          key={`ring-${shakeKey}`}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: emojiSize * 1.6,
            height: emojiSize * 1.6,
            marginLeft: -(emojiSize * 0.8),
            marginTop: -(emojiSize * 0.8),
            borderRadius: "50%",
            border: `3px solid ${cfg.primary}`,
            boxShadow: `0 0 22px ${cfg.glow}, inset 0 0 18px ${cfg.glow}`,
            animation: "giftBurstRing 0.95s ease-out forwards",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Crown gleam beams */}
      {cfg.effect === "crown" && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: emojiSize * 4,
            height: emojiSize * 4,
            marginLeft: -(emojiSize * 2),
            marginTop: -(emojiSize * 2),
            background: `conic-gradient(from 0deg, transparent 0deg, ${cfg.primary}88 10deg, transparent 20deg, transparent 80deg, ${cfg.primary}66 90deg, transparent 100deg, transparent 170deg, ${cfg.primary}88 180deg, transparent 190deg, transparent 260deg, ${cfg.primary}66 270deg, transparent 280deg)`,
            animation: "giftCrownGleam 2.2s linear forwards",
            mixBlendMode: "screen",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Particles */}
      {particles.map((p) => {
        const tx = Math.cos(p.angle) * p.distance;
        const ty = Math.sin(p.angle) * p.distance;
        const animName =
          partMode === "fall"
            ? "giftParticleFall"
            : partMode === "rise"
              ? "giftParticleRise"
              : "giftParticleBurst";

        return (
          <div
            key={`p-${shakeKey}-${p.i}`}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: p.emoji ? p.size : p.size,
              height: p.emoji ? p.size : p.size,
              marginLeft: -(p.size / 2),
              marginTop: -(p.size / 2),
              borderRadius: p.emoji ? 0 : "50%",
              backgroundColor: p.emoji ? "transparent" : p.color,
              boxShadow: p.emoji ? "none" : `0 0 8px ${p.color}`,
              ["--tx" as string]: `${tx}px`,
              ["--ty" as string]: `${ty}px`,
              ["--drift" as string]: `${p.drift}px`,
              ["--rot" as string]: `${p.rotate}deg`,
              animation: `${animName} ${p.dur}ms cubic-bezier(0.2,0.7,0.4,1) ${p.delay}ms forwards`,
              willChange: "transform, opacity",
              pointerEvents: "none",
              fontSize: p.size,
              lineHeight: 1,
              textShadow: p.emoji ? `0 0 8px ${cfg.glow}` : undefined,
            }}
          >
            {p.emoji ?? ""}
          </div>
        );
      })}

      {/* Main emoji */}
      <div
        key={`main-${shakeKey}`}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          marginLeft: -(emojiSize / 2),
          marginTop: -(emojiSize / 2),
          width: emojiSize,
          height: emojiSize,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: mainAnim,
          filter: `drop-shadow(0 0 ${cfg.fullscreen ? 24 : 14}px ${cfg.glow})`,
          willChange: "transform, opacity",
          pointerEvents: "none",
        }}
      >
        <Twemoji emoji={cfg.emoji} size={emojiSize} />
      </div>
    </>
  );
}
