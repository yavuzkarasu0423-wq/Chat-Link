export type Rarity = "common" | "rare" | "epic" | "legendary";

export type EffectKind =
  | "kiss"
  | "bomb"
  | "peach"
  | "cool"
  | "broken"
  | "rose"
  | "petals"
  | "music"
  | "teddy"
  | "diamond"
  | "bouquet"
  | "giftbox"
  | "crown"
  | "rocket"
  | "beads"
  | "ring"
  | "plane"
  | "target";

export interface GiftConfig {
  emoji: string;
  name: string;
  cost: number;
  rarity: Rarity;
  effect: EffectKind;
  primary: string;
  secondary: string;
  glow: string;
  particleEmojis?: string[];
  particleColors: string[];
  particleCount: number;
  duration: number;
  shake: boolean;
  fullscreen: boolean;
  haptic: number | number[];
  tone: { freq: number; type: OscillatorType; duration: number; volume: number }[];
}

const TONES = {
  soft: [{ freq: 660, type: "sine" as OscillatorType, duration: 180, volume: 0.06 }],
  pop: [
    { freq: 880, type: "sine" as OscillatorType, duration: 90, volume: 0.07 },
    { freq: 1320, type: "sine" as OscillatorType, duration: 110, volume: 0.05 },
  ],
  ding: [
    { freq: 1175, type: "triangle" as OscillatorType, duration: 140, volume: 0.07 },
    { freq: 1568, type: "triangle" as OscillatorType, duration: 220, volume: 0.06 },
  ],
  boom: [
    { freq: 110, type: "sawtooth" as OscillatorType, duration: 220, volume: 0.1 },
    { freq: 70, type: "sawtooth" as OscillatorType, duration: 320, volume: 0.08 },
  ],
  fanfare: [
    { freq: 523, type: "triangle" as OscillatorType, duration: 140, volume: 0.07 },
    { freq: 659, type: "triangle" as OscillatorType, duration: 140, volume: 0.07 },
    { freq: 784, type: "triangle" as OscillatorType, duration: 220, volume: 0.08 },
    { freq: 1046, type: "triangle" as OscillatorType, duration: 350, volume: 0.08 },
  ],
};

export const GIFT_REGISTRY: Record<string, GiftConfig> = {
  "💋": { emoji: "💋", name: "Öpücük", cost: 30, rarity: "common", effect: "kiss",
    primary: "#ec4899", secondary: "#f472b6", glow: "rgba(236,72,153,0.55)",
    particleEmojis: ["💋","💕","💖"], particleColors: ["#ec4899","#f472b6","#fb7185"],
    particleCount: 10, duration: 3500, shake: false, fullscreen: false, haptic: 50, tone: TONES.soft },
  "😘": { emoji: "😘", name: "Uçan Öpücük", cost: 30, rarity: "common", effect: "kiss",
    primary: "#f43f5e", secondary: "#fb7185", glow: "rgba(244,63,94,0.55)",
    particleEmojis: ["💋","💕"], particleColors: ["#f43f5e","#fb7185"],
    particleCount: 8, duration: 3500, shake: false, fullscreen: false, haptic: 50, tone: TONES.soft },
  "🥰": { emoji: "🥰", name: "Aşk Patlaması", cost: 30, rarity: "common", effect: "kiss",
    primary: "#f43f5e", secondary: "#ec4899", glow: "rgba(244,63,94,0.55)",
    particleEmojis: ["❤️","💕","💗"], particleColors: ["#f43f5e","#ec4899"],
    particleCount: 10, duration: 3500, shake: false, fullscreen: false, haptic: 50, tone: TONES.soft },
  "🫶": { emoji: "🫶", name: "Kalp Eli", cost: 30, rarity: "common", effect: "kiss",
    primary: "#fb7185", secondary: "#f9a8d4", glow: "rgba(251,113,133,0.55)",
    particleEmojis: ["💗","💖"], particleColors: ["#fb7185","#f9a8d4"],
    particleCount: 8, duration: 3500, shake: false, fullscreen: false, haptic: 50, tone: TONES.soft },
  "💣": { emoji: "💣", name: "Bomba", cost: 30, rarity: "common", effect: "bomb",
    primary: "#ef4444", secondary: "#f97316", glow: "rgba(239,68,68,0.7)",
    particleEmojis: ["💥","✨"], particleColors: ["#ef4444","#f97316","#fbbf24"],
    particleCount: 14, duration: 3000, shake: true, fullscreen: false, haptic: [80,40,80], tone: TONES.boom },
  "🍑": { emoji: "🍑", name: "Şeftali", cost: 30, rarity: "common", effect: "peach",
    primary: "#fb923c", secondary: "#fdba74", glow: "rgba(251,146,60,0.55)",
    particleEmojis: ["🍑","✨"], particleColors: ["#fb923c","#fdba74"],
    particleCount: 8, duration: 3200, shake: false, fullscreen: false, haptic: 60, tone: TONES.pop },
  "😎": { emoji: "😎", name: "Cool", cost: 30, rarity: "common", effect: "cool",
    primary: "#3b82f6", secondary: "#60a5fa", glow: "rgba(59,130,246,0.6)",
    particleEmojis: ["✨","⭐"], particleColors: ["#3b82f6","#60a5fa","#93c5fd"],
    particleCount: 8, duration: 3000, shake: false, fullscreen: false, haptic: 40, tone: TONES.pop },
  "💔": { emoji: "💔", name: "Kırık Kalp", cost: 30, rarity: "common", effect: "broken",
    primary: "#dc2626", secondary: "#475569", glow: "rgba(220,38,38,0.6)",
    particleEmojis: ["💔","🥀"], particleColors: ["#dc2626","#475569"],
    particleCount: 8, duration: 3500, shake: true, fullscreen: false, haptic: [60,30,60], tone: TONES.soft },
  "🌹": { emoji: "🌹", name: "Gül", cost: 50, rarity: "common", effect: "rose",
    primary: "#dc2626", secondary: "#16a34a", glow: "rgba(220,38,38,0.7)",
    particleEmojis: ["🌹","🥀","💖"], particleColors: ["#dc2626","#ef4444","#16a34a"],
    particleCount: 16, duration: 4200, shake: false, fullscreen: false, haptic: 60, tone: TONES.ding },
  "🌸": { emoji: "🌸", name: "Sakura", cost: 100, rarity: "common", effect: "petals",
    primary: "#f9a8d4", secondary: "#fbcfe8", glow: "rgba(249,168,212,0.7)",
    particleEmojis: ["🌸","🌺","✨"], particleColors: ["#f9a8d4","#fbcfe8","#f472b6"],
    particleCount: 18, duration: 4500, shake: false, fullscreen: false, haptic: 50, tone: TONES.ding },
  "🎸": { emoji: "🎸", name: "Gitar", cost: 200, rarity: "rare", effect: "music",
    primary: "#a855f7", secondary: "#c084fc", glow: "rgba(168,85,247,0.7)",
    particleEmojis: ["🎵","🎶","🎼","✨"], particleColors: ["#a855f7","#c084fc","#fbbf24"],
    particleCount: 14, duration: 4200, shake: false, fullscreen: false, haptic: [40,40,40], tone: TONES.fanfare },
  "🐻": { emoji: "🐻", name: "Sevimli Ayı", cost: 300, rarity: "rare", effect: "teddy",
    primary: "#a16207", secondary: "#facc15", glow: "rgba(161,98,7,0.6)",
    particleEmojis: ["💛","✨","💖"], particleColors: ["#facc15","#fbbf24","#fb7185"],
    particleCount: 12, duration: 4200, shake: false, fullscreen: false, haptic: 80, tone: TONES.ding },
  "💎": { emoji: "💎", name: "Elmas", cost: 500, rarity: "rare", effect: "diamond",
    primary: "#06b6d4", secondary: "#67e8f9", glow: "rgba(6,182,212,0.8)",
    particleEmojis: ["💎","✨","⭐"], particleColors: ["#06b6d4","#67e8f9","#ffffff"],
    particleCount: 16, duration: 4500, shake: false, fullscreen: false, haptic: [60,30,60], tone: TONES.ding },
  "💐": { emoji: "💐", name: "Buket", cost: 800, rarity: "rare", effect: "bouquet",
    primary: "#db2777", secondary: "#f472b6", glow: "rgba(219,39,119,0.7)",
    particleEmojis: ["🌹","🌸","🌺","💐","✨"], particleColors: ["#db2777","#f472b6","#fb7185","#a3e635"],
    particleCount: 20, duration: 4500, shake: false, fullscreen: false, haptic: [60,40,60], tone: TONES.fanfare },
  "🎁": { emoji: "🎁", name: "Hediye", cost: 800, rarity: "rare", effect: "giftbox",
    primary: "#dc2626", secondary: "#facc15", glow: "rgba(220,38,38,0.7)",
    particleEmojis: ["🎁","✨","🎀","💖"], particleColors: ["#dc2626","#facc15","#22c55e"],
    particleCount: 16, duration: 4500, shake: false, fullscreen: false, haptic: [60,40,60], tone: TONES.fanfare },
  "👑": { emoji: "👑", name: "Kraliyet Tacı", cost: 2000, rarity: "epic", effect: "crown",
    primary: "#facc15", secondary: "#fde047", glow: "rgba(250,204,21,0.9)",
    particleEmojis: ["👑","✨","⭐","💛"], particleColors: ["#facc15","#fde047","#fbbf24"],
    particleCount: 24, duration: 5000, shake: false, fullscreen: false, haptic: [80,50,80,50,80], tone: TONES.fanfare },
  "📿": { emoji: "📿", name: "Tesbih", cost: 3000, rarity: "epic", effect: "beads",
    primary: "#a855f7", secondary: "#d8b4fe", glow: "rgba(168,85,247,0.8)",
    particleEmojis: ["📿","✨","⭐"], particleColors: ["#a855f7","#d8b4fe","#facc15"],
    particleCount: 20, duration: 5000, shake: false, fullscreen: false, haptic: [80,50,80], tone: TONES.fanfare },
  "💍": { emoji: "💍", name: "Yüzük", cost: 4000, rarity: "epic", effect: "ring",
    primary: "#fbbf24", secondary: "#ffffff", glow: "rgba(251,191,36,0.9)",
    particleEmojis: ["💍","✨","💖","⭐"], particleColors: ["#fbbf24","#ffffff","#f9a8d4"],
    particleCount: 24, duration: 5500, shake: false, fullscreen: false, haptic: [80,40,80,40,120], tone: TONES.fanfare },
  "🚀": { emoji: "🚀", name: "Roket", cost: 3000, rarity: "legendary", effect: "rocket",
    primary: "#f97316", secondary: "#facc15", glow: "rgba(249,115,22,0.9)",
    particleEmojis: ["🔥","✨","⭐","💥"], particleColors: ["#f97316","#facc15","#ef4444"],
    particleCount: 30, duration: 6000, shake: true, fullscreen: true, haptic: [120,60,120,60,200], tone: TONES.boom },
  "✈️": { emoji: "✈️", name: "Uçak", cost: 8000, rarity: "legendary", effect: "plane",
    primary: "#3b82f6", secondary: "#93c5fd", glow: "rgba(59,130,246,0.9)",
    particleEmojis: ["☁️","✨","⭐"], particleColors: ["#3b82f6","#93c5fd","#ffffff"],
    particleCount: 28, duration: 6000, shake: true, fullscreen: true, haptic: [100,50,100,50,200], tone: TONES.fanfare },
  "🎯": { emoji: "🎯", name: "Hedef", cost: 10000, rarity: "legendary", effect: "target",
    primary: "#ef4444", secondary: "#facc15", glow: "rgba(239,68,68,0.9)",
    particleEmojis: ["🎯","💥","✨","⭐"], particleColors: ["#ef4444","#facc15","#22c55e"],
    particleCount: 32, duration: 6500, shake: true, fullscreen: true, haptic: [150,80,150,80,250], tone: TONES.boom },
};

const FALLBACK: GiftConfig = {
  emoji: "🎁", name: "Hediye", cost: 50, rarity: "common", effect: "giftbox",
  primary: "#a855f7", secondary: "#f472b6", glow: "rgba(168,85,247,0.6)",
  particleEmojis: ["✨","💖"], particleColors: ["#a855f7","#f472b6","#fbbf24"],
  particleCount: 12, duration: 3500, shake: false, fullscreen: false, haptic: 60, tone: TONES.pop,
};

export function getGiftConfig(emoji: string): GiftConfig {
  return GIFT_REGISTRY[emoji] ?? { ...FALLBACK, emoji };
}

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Yaygın",
  rare: "Nadir",
  epic: "Epik",
  legendary: "Efsanevi",
};

export const RARITY_GRADIENT: Record<Rarity, string> = {
  common: "linear-gradient(135deg, #64748b, #94a3b8)",
  rare: "linear-gradient(135deg, #3b82f6, #06b6d4)",
  epic: "linear-gradient(135deg, #a855f7, #ec4899)",
  legendary: "linear-gradient(135deg, #f59e0b, #ef4444, #ec4899)",
};

// ─────────────────────────────────────────────
// Audio + Haptics
// ─────────────────────────────────────────────
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (_audioCtx) return _audioCtx;
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    _audioCtx = new Ctor();
    return _audioCtx;
  } catch {
    return null;
  }
}

export function playGiftTone(cfg: GiftConfig, comboMultiplier = 1): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const start = ctx.currentTime;
  let t = start;
  for (const note of cfg.tone) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = note.type;
      osc.frequency.setValueAtTime(note.freq * Math.min(2, 1 + (comboMultiplier - 1) * 0.05), t);
      const vol = Math.min(0.18, note.volume * Math.min(1.5, 1 + (comboMultiplier - 1) * 0.1));
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + note.duration / 1000);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + note.duration / 1000 + 0.05);
      t += note.duration / 1000 * 0.7;
    } catch {
      // ignore
    }
  }
}

export function triggerHaptic(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate === "function") {
    try { nav.vibrate(pattern); } catch { /* ignore */ }
  }
}
