import { useEffect, useRef, useState } from "react";
import { setLanguage } from "../i18n";

import type { Filters } from "./Chat";

// ─────────────────────────────────────────────
// Bildirim sesi (Web Audio API — dosya gerekmez)
// Debounce: aynı anda birden fazla ses çalmasın
// ─────────────────────────────────────────────
let _lastDmSound = 0;
function playDmSound() {
  const now = Date.now();
  if (now - _lastDmSound < 2500) return; // 2.5s içinde tekrar çalma
  _lastDmSound = now;
  try {
    const ctx = new AudioContext();
    const times = [0, 0.18];
    times.forEach((t) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0, ctx.currentTime + t);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.25);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.25);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* sessiz geç */ }
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type Modal = "none" | "login" | "safety" | "coins" | "coin-history" | "filters" | "terms" | "privacy";
type Tab = "home" | "kesfet" | "match" | "messages";

export interface LandingProps {
  onStartChat: () => void;
  activeUsers: number;
  startLoggedIn?: boolean;
  onLogin?: () => void;
  onLogout?: () => void;
  authedUser?: { id: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null } | null;
  coins?: number;
  filters?: Filters;
  onFiltersChange?: (f: Filters) => void;
  forceProfileOpen?: boolean;
  onProfileSaved?: (p: { displayName: string; photoUrl: string | null }) => void;
}

interface OnlineUser {
  userId: string;
  displayName: string;
  age: number | null;
  gender: string | null;
  country: string | null;
  photoUrl: string | null;
}

interface FriendRow {
  userId: string;
  displayName: string;
  photoUrl: string | null;
  country: string | null;
  status: "pending" | "accepted";
  direction: "incoming" | "outgoing" | "mutual";
}

interface DmThread {
  peerId: string;
  displayName: string;
  photoUrl: string | null;
  preview: string;
  unread: number;
  lastAt: string | null;
}

interface DmMessage {
  id: number;
  fromUserId: string;
  toUserId: string;
  text: string;
  createdAt: string;
}

const COUNTRIES = [
  "Türkiye", "Almanya", "İngiltere", "ABD", "Fransa", "İspanya", "İtalya",
  "Brezilya", "Mısır", "Suudi Arabistan", "Fas", "Tunus", "Cezayir",
  "Endonezya", "Hindistan", "Pakistan", "Filipinler", "Tayland",
];

// ─────────────────────────────────────────────
// Static data
// ─────────────────────────────────────────────
const COLS: { src: string; bg: string }[][] = [
  [
    { src: "https://randomuser.me/api/portraits/women/1.jpg",  bg: "#e9d5ff" },
    { src: "https://randomuser.me/api/portraits/men/32.jpg",   bg: "#bbf7d0" },
    { src: "https://randomuser.me/api/portraits/women/44.jpg", bg: "#fde68a" },
    { src: "https://randomuser.me/api/portraits/men/11.jpg",   bg: "#fbcfe8" },
    { src: "https://randomuser.me/api/portraits/women/68.jpg", bg: "#bfdbfe" },
  ],
  [
    { src: "https://randomuser.me/api/portraits/women/26.jpg", bg: "#fecaca" },
    { src: "https://randomuser.me/api/portraits/men/55.jpg",   bg: "#fed7aa" },
    { src: "https://randomuser.me/api/portraits/women/37.jpg", bg: "#a7f3d0" },
    { src: "https://randomuser.me/api/portraits/men/63.jpg",   bg: "#c7d2fe" },
    { src: "https://randomuser.me/api/portraits/women/19.jpg", bg: "#fde68a" },
  ],
  [
    { src: "https://randomuser.me/api/portraits/men/22.jpg",   bg: "#d1fae5" },
    { src: "https://randomuser.me/api/portraits/women/50.jpg", bg: "#fbcfe8" },
    { src: "https://randomuser.me/api/portraits/men/8.jpg",    bg: "#fee2e2" },
    { src: "https://randomuser.me/api/portraits/women/77.jpg", bg: "#ddd6fe" },
    { src: "https://randomuser.me/api/portraits/men/42.jpg",   bg: "#dcfce7" },
  ],
];



const COIN_PKGS = [
  { coins: 300,   price: 96,   original: 160   },
  { coins: 650,   price: 200,  original: 330   },
  { coins: 1250,  price: 361,  original: 451   },
  { coins: 1800,  price: 479,  original: 620   },
  { coins: 3500,  price: 883,  original: 1254  },
  { coins: 7000,  price: 1675, original: 2507  },
  { coins: 15000, price: 3528, original: 5080  },
  { coins: 35000, price: 8048, original: 14632 },
];

const SAFETY = [
  { icon: "shield", text: "İçerik kuralları aktif olarak denetlenmektedir" },
  { icon: "age",    text: "Minörlerin hizmeti kullanması yasaktır"  },
  { icon: "ban",    text: "Şiddet içerikleri yasaktır"             },
  { icon: "norecord", text: "Ekran kaydı yasaktır"                 },
  { icon: "adult",  text: "Porno içerik yasaktır"                  },
];

function SafetyIcon({ name }: { name: string }) {
  if (name === "shield") return (
    <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2.25c-4.55 1.636-7.5 4.636-7.5 8.25v4.5l7.5 3.75 7.5-3.75v-4.5c0-3.614-2.95-6.614-7.5-8.25z" />
    </svg>
  );
  if (name === "age") return (
    <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
  if (name === "ban") return (
    <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  );
  if (name === "norecord") return (
    <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M12 18.75H4.5a2.25 2.25 0 01-2.25-2.25V9m12.841 9.091L16.5 19.5m-1.409-1.409c.407-.407.659-.97.659-1.591v-9a2.25 2.25 0 00-2.25-2.25h-9c-.621 0-1.184.252-1.591.659m12.182 12.182L2.909 5.909M1.5 4.5l1.409 1.409" />
    </svg>
  );
  return (
    <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

// ─────────────────────────────────────────────
// Small reusable components
// ─────────────────────────────────────────────
function Logo({ size = 40 }: { size?: number }) {
  return (
    <img
      src="/app-logo.png"
      alt="1v1 Chat"
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: size * 0.28, objectFit: "cover" }}
      draggable={false}
    />
  );
}

function StartBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ background: "linear-gradient(to right, #a3e635, #22c55e)", boxShadow: "0 4px 20px rgba(34,197,94,0.4)" }}
      className="flex items-center gap-2.5 px-8 py-4 rounded-full font-bold text-white text-base transition-all hover:scale-105 active:scale-95"
    >
      {children}
    </button>
  );
}

function Avatar({ img, fallback = "?" }: { img?: string; fallback?: string }) {
  const [imgError, setImgError] = useState(false);
  return (
    <div className="w-10 h-10 rounded-full overflow-hidden bg-orange-400 flex items-center justify-center flex-shrink-0">
      {img && !imgError ? (
        <img src={img} className="w-full h-full object-cover" alt="" onError={() => setImgError(true)} />
      ) : (
        <span className="text-white font-bold text-sm">{fallback}</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Photo Collage
// ─────────────────────────────────────────────
function PhotoCollage() {
  const durations = [22, 28, 25];
  const offsets   = [0, -80, -40];
  return (
    <div className="flex gap-3 overflow-hidden h-full select-none" aria-hidden>
      {COLS.map((col, ci) => (
        <div
          key={ci}
          className="flex flex-col gap-3"
          style={{ marginTop: offsets[ci], animation: `scrollCol ${durations[ci]}s linear infinite` }}
        >
          {[...col, ...col].map((p, i) => (
            <div
              key={i}
              className="rounded-[36px] overflow-hidden flex-shrink-0"
              style={{ width: 120, height: 180, backgroundColor: p.bg }}
            >
              <img
                src={p.src}
                className="w-full h-full object-cover"
                alt=""
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Login Modal
// ─────────────────────────────────────────────
function LoginModal({ onClose, onContinue, onTerms, onPrivacy }: { onClose: () => void; onContinue: () => void; onTerms?: () => void; onPrivacy?: () => void }) {
  // onContinue triggers real OIDC login redirect (Google/Apple/Phone all routed through Replit Auth)
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 relative shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 text-lg font-bold">✕</button>

        {/* Logo */}
        <div className="flex flex-col items-center mb-5">
          <Logo size={56} />
          <h2 className="text-2xl font-bold text-gray-900 mt-3">1v1 Chat</h2>
        </div>

        {/* Promo banner */}
        <div className="bg-gradient-to-r from-red-500 to-pink-500 rounded-2xl p-3 mb-5 flex items-center gap-3">
          <div className="bg-white/20 rounded-xl px-3 py-2 text-center flex-shrink-0">
            <div className="text-white text-xs font-bold">FREE</div>
            <div className="text-white font-black text-xl leading-none">+100</div>
          </div>
          <div className="text-white text-sm leading-snug">
            <div className="font-bold">Bedava coin kazanmak için üye ol</div>
            <div className="opacity-90 text-xs mt-0.5">100 coin = 5 bedava görüntülü arama</div>
          </div>
        </div>

        {/* Fix 8: Tek gerçek giriş butonu — tüm seçenekler aynı Replit OAuth akışını kullanıyor */}
        <div className="flex flex-col gap-3">
          <button
            onClick={onContinue}
            className="flex items-center justify-center gap-3 bg-gray-900 rounded-full px-5 py-3.5 hover:bg-gray-700 transition-colors text-sm font-semibold text-white w-full"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 110-16 8 8 0 010 16zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
            </svg>
            Giriş Yap / Üye Ol
          </button>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <div className="flex-1 h-px bg-gray-200" />
            <span>Google, Apple veya e-posta ile</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div className="flex justify-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-gray-500"><span className="font-bold text-red-500">G</span> Google</div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.28.06 2.17.73 2.94.77 1.13-.21 2.22-.9 3.47-.79 1.48.14 2.59.75 3.28 1.96-3 1.77-2.39 5.86.48 6.98-.56 1.45-1.27 2.88-2.17 3.96zM13 3.5c.12 1.73-1.28 3.27-3.07 3.39C9.7 5.11 11.21 3.5 13 3.5z"/></svg>
              Apple
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
              E-posta
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-5 leading-relaxed">
          Giriş yaparak 18 yaşın üzerinde olduğunuzu,{" "}
          <span className="text-blue-500 underline cursor-pointer" onClick={(e) => { e.stopPropagation(); onTerms?.(); }}>Kullanım Koşulları</span>'nı kabul ettiğinizi ve{" "}
          <span className="text-blue-500 underline cursor-pointer" onClick={(e) => { e.stopPropagation(); onPrivacy?.(); }}>Gizlilik Politikası</span>'nı okuduğunuzu bildirmektesiniz.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Safety Modal
// ─────────────────────────────────────────────
function SafetyModal({ onAgree }: { onAgree: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-sm p-7 shadow-2xl">
        <h2 className="text-2xl font-black text-gray-900 text-center mb-1">Güvende kalın ve sohbet edin</h2>
        <p className="text-gray-500 text-sm text-center mb-6">Güvenliğiniz bizim önceliğimizdir</p>

        <div className="flex flex-col gap-3 mb-7">
          {SAFETY.map((r) => (
            <div key={r.text} className="flex items-center gap-3 bg-gray-900 rounded-2xl px-4 py-3.5">
              <SafetyIcon name={r.icon} />
              <span className="text-white text-sm font-medium">{r.text}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onAgree}
          className="w-full py-3.5 rounded-full font-bold text-white text-base transition-all hover:scale-105 active:scale-95"
          style={{ background: "linear-gradient(to right, #f43f5e, #ec4899)" }}
        >
          Katılıyorum
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Coins Modal
// ─────────────────────────────────────────────
function CoinsModal({ onClose }: { onClose: () => void }) {
  const [selectedPkg, setSelectedPkg] = useState<number | null>(null);
  const [buying, setBuying] = useState(false);
  const [purchased, setPurchased] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [dailyClaimed, setDailyClaimed] = useState(false);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyErr, setDailyErr] = useState(false);

  const coinIcon = (coins: number) => coins >= 15000 ? "🏆" : coins >= 3500 ? "🎁" : "🪙";

  const claimDaily = async () => {
    setDailyLoading(true);
    setDailyErr(false);
    try {
      const res = await fetch("/api/coins/daily", { method: "POST", credentials: "include" });
      if (res.ok || res.status === 409) setDailyClaimed(true);
      else setDailyErr(true);
    } catch { setDailyErr(true); }
    finally { setDailyLoading(false); }
  };

  const buy = async () => {
    if (!selectedPkg || buying) return;
    setBuying(true);
    setPaymentError(null);
    try {
      const res = await fetch("/api/checkout/session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: `pkg_${selectedPkg}` }),
      });
      if (res.ok) {
        const { url } = (await res.json()) as { url: string };
        if (url) { window.location.href = url; return; }
      }
      setPaymentError("Ödeme sistemi şu an aktif değil. Yönetici ile iletişime geçin.");
    } catch {
      setPaymentError("Ödeme sistemi şu an aktif değil. Yönetici ile iletişime geçin.");
    }
    setBuying(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-2 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-gray-900">Altın Para Al</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 font-bold">✕</button>
        </div>

        {/* Günlük bonus */}
        <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-2xl p-4 mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-white font-bold text-sm">🎁 Günlük Bonus</p>
            <p className="text-white/80 text-xs mt-0.5">Her gün 50 ücretsiz coin kazanın!</p>
          </div>
          <button onClick={claimDaily} disabled={dailyClaimed || dailyLoading}
            className="bg-white text-orange-600 font-bold text-sm px-4 py-2 rounded-full disabled:opacity-60 hover:bg-orange-50 transition-colors whitespace-nowrap flex-shrink-0">
            {dailyClaimed ? "✅ Alındı" : dailyLoading ? "…" : dailyErr ? "Tekrar Dene" : "Al +50"}
          </button>
        </div>

        {purchased ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">🎉</div>
            <p className="font-bold text-gray-900 text-xl">Satın Alındı!</p>
            <p className="text-gray-500 text-sm mt-2">Coinleriniz hesabınıza eklendi.</p>
            <button onClick={onClose} className="mt-6 bg-emerald-500 text-white px-8 py-2.5 rounded-full font-semibold hover:bg-emerald-600">Tamam</button>
          </div>
        ) : (
          <>
            {paymentError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
                <span className="text-base shrink-0">⚠️</span>
                <span>{paymentError}</span>
              </div>
            )}
            <p className="text-xs font-semibold text-gray-500 mb-3">Paket Seçin</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {COIN_PKGS.map((pkg) => (
                <button key={pkg.coins}
                  onClick={() => setSelectedPkg(pkg.coins === selectedPkg ? null : pkg.coins)}
                  className={`border-2 rounded-2xl p-3 text-center transition-all ${selectedPkg === pkg.coins ? "border-orange-400 bg-orange-50 scale-105 shadow-md" : "border-gray-200 hover:border-orange-300 hover:bg-orange-50/50"}`}>
                  <div className="font-bold text-gray-900 text-sm">{pkg.coins.toLocaleString()}</div>
                  <div className="text-2xl my-1">{coinIcon(pkg.coins)}</div>
                  <div className="text-gray-400 text-xs line-through">₺{pkg.original}</div>
                  <div className="text-gray-900 font-semibold text-sm">₺{pkg.price}</div>
                </button>
              ))}
            </div>
            <button onClick={buy} disabled={!selectedPkg || buying}
              className={`w-full py-3.5 rounded-full font-bold text-base mb-3 transition-colors ${selectedPkg ? "bg-orange-500 text-white hover:bg-orange-600" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>
              {buying ? "İşleniyor…" : selectedPkg ? `${COIN_PKGS.find((p) => p.coins === selectedPkg)?.coins.toLocaleString()} Coin Satın Al` : "Paket Seçin"}
            </button>
          </>
        )}

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Profile Page (real)
// ─────────────────────────────────────────────
interface MatchStats { totalMatches: number; totalSeconds: number; uniquePeers: number; }
interface MatchRow { id: number; peerId: string | null; displayName: string | null; photoUrl: string | null; durationSeconds: number; createdAt: string; }
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}s ${m}dk`;
  if (m > 0) return `${m} dk`;
  return `${seconds}sn`;
}

interface ProfileData {
  userId: string;
  displayName: string;
  age: number;
  gender: string;
  country: string;
  bio: string | null;
  interests: string[];
  photoUrl: string | null;
}

const PROFILE_DEFAULTS: ProfileData = {
  userId: "",
  displayName: "",
  age: 18,
  gender: "erkek",
  country: "Türkiye",
  bio: null,
  interests: [],
  photoUrl: null,
};

function ProfilePage({ onClose, onSaved, onOpenSettings, coins, onOpenCoins }: { onClose: () => void; onSaved?: (p: { displayName: string; photoUrl: string | null }) => void; onOpenSettings?: () => void; coins?: number; onOpenCoins?: () => void }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileData | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [matchStats, setMatchStats] = useState<MatchStats | null>(null);
  const [showBlocked, setShowBlocked] = useState(false);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [dmSentTo, setDmSentTo] = useState<string | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);

  useEffect(() => {
    fetch("/api/profile/me", { credentials: "include" })
      .then((r) => {
        if (!r.ok) {
          // Yeni kullanıcı — profil yok, hemen oluşturma formunu aç
          setIsNewUser(true);
          setDraft({ ...PROFILE_DEFAULTS });
          setEditing(true);
          return null;
        }
        return r.json();
      })
      .then((d: { profile: ProfileData | null } | null) => { if (d) setProfile(d.profile ?? null); })
      .catch(() => setErr("Profil yüklenemedi"));
    fetch("/api/matches/stats", { credentials: "include" })
      .then((r) => r.json())
      .then((d: MatchStats) => setMatchStats(d))
      .catch(() => {});
    fetch("/api/matches", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { matches: MatchRow[] }) => setMatches(d.matches || []))
      .catch(() => {});
  }, []);

  const sendDmToMatch = async (peerId: string) => {
    setDmSentTo(peerId);
    await fetch("/api/dms", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: peerId, body: "Merhaba! 👋" }),
    }).catch(() => {});
    setTimeout(() => setDmSentTo(null), 3000);
  };

  const startEdit = () => { setDraft(profile); setEditing(true); };
  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile/me", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: draft.displayName,
          age: draft.age,
          gender: draft.gender,
          country: draft.country,
          bio: draft.bio,
          interests: draft.interests,
          photoUrl: draft.photoUrl,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      const data = (await res.json()) as { profile: ProfileData };
      setProfile(data.profile);
      setEditing(false);
      setIsNewUser(false);
      // Profil kaydedildi — parent'a bildir (video chat'i başlatmak için)
      onSaved?.({ displayName: data.profile.displayName, photoUrl: data.profile.photoUrl });
    } catch {
      setErr("Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-white z-40 flex flex-col animate-fade-in">
      {showBlocked && <BlockedPanel onClose={() => setShowBlocked(false)} />}
      <div className="flex items-center px-4 py-3 border-b border-gray-100">
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="ml-auto flex items-center gap-2">
          {coins !== undefined && onOpenCoins && (
            <button
              onClick={onOpenCoins}
              className="flex items-center gap-1.5 flex-shrink-0 rounded-full px-3"
              style={{ background: "linear-gradient(135deg, #4ade80 0%, #a3e635 100%)", height: 30, boxShadow: "0 2px 6px rgba(74,222,128,0.35)" }}
            >
              <img src="/coin-icon.png" alt="coin" style={{ width: 18, height: 18, objectFit: "contain", flexShrink: 0 }} />
              <span className="font-extrabold text-black text-sm tracking-tight leading-none">{coins}</span>
            </button>
          )}
          {onOpenSettings && (
            <button onClick={onOpenSettings} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {err && <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3 mb-4">{err}</div>}
        {(!profile && !isNewUser) ? (
          <div className="text-center text-gray-400 py-10">Yükleniyor…</div>
        ) : (!editing && profile) ? (
          <>
            <div className="flex flex-col items-center mb-6">
              {profile.photoUrl ? (
                <img src={profile.photoUrl} alt="" className="w-24 h-24 rounded-full object-cover mb-3" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-orange-500 flex items-center justify-center text-white font-black text-3xl mb-3">
                  {profile.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="text-xs text-gray-400">Kimlik No: {profile.userId.slice(0, 10)}</div>
              <h2 className="text-xl font-bold text-gray-900 mt-2">{profile.displayName}, {profile.age}</h2>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                <span>{profile.country}</span><span>•</span><span>{profile.gender}</span>
              </div>
              {profile.bio && <p className="text-center text-sm text-gray-600 mt-3 max-w-sm">{profile.bio}</p>}
              {profile.interests.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3 justify-center max-w-sm">
                  {profile.interests.map((i) => (
                    <span key={i} className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-semibold">{i}</span>
                  ))}
                </div>
              )}
            </div>
            {/* Görüşme istatistikleri */}
            {matchStats !== null && (
              <div className="grid grid-cols-3 gap-2 mt-5 mb-2 max-w-xs mx-auto w-full">
                <div className="bg-emerald-50 rounded-2xl p-3 text-center">
                  <div className="text-xl font-black text-emerald-700">{matchStats.totalMatches}</div>
                  <div className="text-xs text-emerald-600 mt-0.5">Görüşme</div>
                </div>
                <div className="bg-blue-50 rounded-2xl p-3 text-center">
                  <div className="text-xl font-black text-blue-700">{matchStats.uniquePeers}</div>
                  <div className="text-xs text-blue-600 mt-0.5">Farklı Kişi</div>
                </div>
                <div className="bg-purple-50 rounded-2xl p-3 text-center">
                  <div className="text-sm font-black text-purple-700 leading-tight">{matchStats.totalSeconds > 0 ? formatDuration(matchStats.totalSeconds) : "—"}</div>
                  <div className="text-xs text-purple-600 mt-0.5">Toplam Süre</div>
                </div>
              </div>
            )}
            <div className="flex flex-col items-center gap-2 mt-3">
              <button onClick={startEdit} className="bg-emerald-500 text-white px-8 py-2.5 rounded-full font-semibold text-sm hover:bg-emerald-600">Düzenle</button>
              <button onClick={() => setShowBlocked(true)} className="text-xs text-gray-400 hover:text-gray-600 underline">Engellediklerim</button>
            </div>

            {/* Son Görüşmeler */}
            <div className="mt-6">
              <h3 className="font-semibold text-gray-800 text-sm mb-3">Son Görüşmeler</h3>
              {matches.length === 0 ? (
                <div className="text-center py-6 text-gray-400">
                  <div className="text-3xl mb-2">🎥</div>
                  <p className="text-sm">Henüz görüşme yapılmadı.</p>
                  <p className="text-xs text-gray-300 mt-1">İlk görüşmeni başlat!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {matches.slice(0, 10).map((m) => (
                    <div key={m.id} className="flex items-center gap-3 bg-gray-50 rounded-2xl px-3 py-2.5">
                      {m.photoUrl ? (
                        <img src={m.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-orange-400 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {(m.displayName ?? "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{m.displayName ?? "Yabancı"}</p>
                        <p className="text-xs text-gray-400">{m.durationSeconds > 0 ? formatDuration(m.durationSeconds) : "< 1 dk"} · {new Date(m.createdAt).toLocaleDateString("tr-TR")}</p>
                      </div>
                      {m.peerId && (
                        <button
                          onClick={() => sendDmToMatch(m.peerId!)}
                          disabled={dmSentTo === m.peerId}
                          className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors shrink-0 ${dmSentTo === m.peerId ? "bg-emerald-100 text-emerald-600" : "bg-blue-500 text-white hover:bg-blue-600"}`}
                        >
                          {dmSentTo === m.peerId ? "✓ Gönderildi" : "💬 DM"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : draft && (
          <div className="space-y-3 max-w-md mx-auto">
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Görünen ad</span>
              <input value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Yaş</span>
              <input type="number" min={18} value={draft.age} onChange={(e) => setDraft({ ...draft, age: Number(e.target.value) })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Cinsiyet</span>
              <select value={draft.gender} onChange={(e) => setDraft({ ...draft, gender: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                <option value="erkek">Erkek</option><option value="kadın">Kadın</option><option value="diğer">Diğer</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Ülke</span>
              <select value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm">
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Hakkında</span>
              <textarea value={draft.bio ?? ""} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} rows={3} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            </label>
            {/* Profil fotoğrafı yükleme */}
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Profil Fotoğrafı</span>
              <div className="mt-2 flex items-center gap-3">
                {draft.photoUrl ? (
                  <img src={draft.photoUrl} alt="" className="w-14 h-14 rounded-full object-cover border border-gray-200 flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-orange-200 flex items-center justify-center text-orange-600 font-black text-xl flex-shrink-0">
                    {draft.displayName?.charAt(0)?.toUpperCase() ?? "?"}
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-4 py-2 rounded-full inline-block transition-colors flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg>
                    Fotoğraf Yükle
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 15 * 1024 * 1024) { alert("Fotoğraf 15MB'den küçük olmalı"); return; }
                      const img = document.createElement("img");
                      const url = URL.createObjectURL(file);
                      img.onload = () => {
                        const MAX = 480;
                        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
                        const canvas = document.createElement("canvas");
                        canvas.width = Math.round(img.width * ratio);
                        canvas.height = Math.round(img.height * ratio);
                        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
                        URL.revokeObjectURL(url);
                        setDraft({ ...draft!, photoUrl: canvas.toDataURL("image/jpeg", 0.8) });
                      };
                      img.src = url;
                    }} />
                  </label>
                  {draft.photoUrl && (
                    <button type="button" onClick={() => setDraft({ ...draft, photoUrl: null })} className="text-red-400 text-xs hover:text-red-600 text-left">Kaldır</button>
                  )}
                </div>
              </div>
            </label>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditing(false)} className="flex-1 py-2.5 rounded-full border border-gray-200 font-semibold text-sm">İptal</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-full bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 disabled:opacity-50">{saving ? "Kaydediliyor…" : "Kaydet"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Messages Panel (real DMs)
// ─────────────────────────────────────────────
function MessagesPanel({ onClose, meId, initialPeer, onMarkRead }: {
  onClose: () => void;
  meId: string;
  initialPeer?: { peerId: string; displayName: string; photoUrl: string | null };
  onMarkRead?: (count: number) => void;
}) {
  // w-full on mobile, fixed w-80 on sm+
  const [threads, setThreads] = useState<DmThread[]>([]);
  const [openPeer, setOpenPeer] = useState<DmThread | null>(
    initialPeer ? { peerId: initialPeer.peerId, displayName: initialPeer.displayName, photoUrl: initialPeer.photoUrl, preview: "", unread: 0, lastAt: null } : null
  );
  const [msgs, setMsgs] = useState<DmMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mesaj ID tabanlı yeni mesaj tespiti
  const lastSeenMsgIdRef = useRef<number>(-1);
  // İlk yüklemede ses çalmasın — sadece sonraki fetch'lerde yeni mesaj ara
  const isFirstFetchRef = useRef(true);

  const loadThreads = () => {
    fetch("/api/dms", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { threads: DmThread[] }) => setThreads(d.threads || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadThreads();
  }, []);

  // Konuşma açıkken mesajları çek — ID'ye göre yeni mesaj tespiti
  const fetchMsgs = (peerId: string) =>
    fetch(`/api/dms/${peerId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { messages: DmMessage[] }) => {
        // Sadece gerçek sunucu ID'leri (sayı ve makul büyüklükte)
        const OPTIMISTIC_THRESHOLD = 9_999_999_999; // Date.now() ~ 1.7 trilyon, server ID << bu
        const serverMsgs = (d.messages || []).filter(
          (m) => typeof m.id === "number" && m.id <= OPTIMISTIC_THRESHOLD
        );

        // Optimistik mesajları koru: benden gelip sunucuda henüz yok olanlar
        setMsgs((prev) => {
          const pending = prev.filter(
            (m) => m.id > OPTIMISTIC_THRESHOLD &&
              m.fromUserId === meId &&
              !serverMsgs.some((s) => s.text === m.text && s.fromUserId === meId)
          );
          return [...serverMsgs, ...pending];
        });

        // İlk fetch'te ses çalma — mevcut mesajların cursor'ını kur
        if (!isFirstFetchRef.current && lastSeenMsgIdRef.current >= 0) {
          const newFromOther = serverMsgs.filter(
            (m) => m.id > lastSeenMsgIdRef.current && m.fromUserId !== meId
          );
          if (newFromOther.length > 0) playDmSound();
        }
        isFirstFetchRef.current = false;

        // Cursor'ı güncelle (yalnızca gerçek sunucu ID'leriyle)
        if (serverMsgs.length > 0) {
          lastSeenMsgIdRef.current = serverMsgs.reduce((max, m) => Math.max(max, m.id), lastSeenMsgIdRef.current);
        }
      });

  useEffect(() => {
    if (!openPeer) {
      pollingRef.current && clearInterval(pollingRef.current);
      lastSeenMsgIdRef.current = -1;
      isFirstFetchRef.current = true;
      return;
    }
    // Konuşma açılınca badge'i hemen sıfırla
    if (openPeer.unread > 0) onMarkRead?.(openPeer.unread);
    // Yeni konuşma: cursor sıfırla, ilk fetch sesiz yükle
    lastSeenMsgIdRef.current = -1;
    isFirstFetchRef.current = true;
    fetchMsgs(openPeer.peerId);
    pollingRef.current = setInterval(() => fetchMsgs(openPeer.peerId), 1000);
    return () => { pollingRef.current && clearInterval(pollingRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPeer?.peerId]);

  // Yeni mesaj gelince en alta kaydır
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  const send = async () => {
    if (!text.trim() || !openPeer) return;
    const body = text.trim();
    setText("");
    // Optimistik güncelleme — anlık göster
    const tempMsg: DmMessage = { id: Date.now(), fromUserId: meId, toUserId: openPeer.peerId, text: body, createdAt: new Date().toISOString() };
    setMsgs((m) => [...m, tempMsg]);
    const res = await fetch("/api/dms", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: openPeer.peerId, body }),
    });
    if (res.ok) {
      // Gerçek mesajla değiştir (ID güncelle)
      const d = (await res.json()) as { message: DmMessage };
      setMsgs((m) => m.map((msg) => msg.id === tempMsg.id ? d.message : msg));
      loadThreads(); // thread listesini güncelle
    }
  };

  return (
    <div className="absolute right-0 top-0 bottom-0 w-full sm:w-80 bg-white border-l border-gray-100 z-30 flex flex-col shadow-xl animate-slide-right">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        {openPeer ? (
          <>
            <button onClick={() => { setOpenPeer(null); setMsgs([]); }} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">
              <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="font-semibold text-gray-900 text-sm truncate">{openPeer.displayName}</span>
            <div className="w-7" />
          </>
        ) : (
          <>
            <span className="font-semibold text-gray-900 text-sm">Mesajlarım</span>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg font-bold">✕</button>
          </>
        )}
      </div>

      {openPeer ? (
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {msgs.length === 0 ? (
              <div className="text-center text-xs text-gray-400 mt-6">Henüz mesaj yok. İlk mesajı sen gönder!</div>
            ) : msgs.map((m) => {
              const mine = m.fromUserId === meId;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-800"}`}>
                    {m.text}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
          <div className="p-3 border-t border-gray-100 flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="Mesaj…"
              className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm outline-none"
            />
            <button onClick={send} className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center text-lg">→</button>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center text-xs text-gray-400 mt-6">Yükleniyor…</div>
          ) : threads.length === 0 ? (
            <div className="text-center text-xs text-gray-400 mt-6 px-6">Henüz mesajlaşma yok. Keşfet sekmesinden birine ulaşabilirsin.</div>
          ) : threads.map((t) => (
            <div key={t.peerId} onClick={() => setOpenPeer(t)} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50">
              {t.photoUrl ? (
                <img src={t.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500">{t.displayName.charAt(0)}</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{t.displayName}</p>
                <p className="text-xs text-gray-500 truncate">{t.preview}</p>
              </div>
              {t.unread > 0 && (
                <span className="w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">{t.unread}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Friends Panel (real)
// ─────────────────────────────────────────────
function FriendsPanel({ onClose, onMessage }: { onClose: () => void; onMessage?: (peer: { userId: string; displayName: string; photoUrl: string | null }) => void }) {
  const [rows, setRows] = useState<FriendRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    fetch("/api/friends", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { friends: FriendRow[] }) => setRows(d.friends || []))
      .finally(() => setLoading(false));
  };
  useEffect(reload, []);

  const accept = async (peerId: string) => {
    await fetch(`/api/friends/${peerId}/accept`, { method: "POST", credentials: "include" });
    reload();
  };
  const remove = async (peerId: string) => {
    await fetch(`/api/friends/${peerId}`, { method: "DELETE", credentials: "include" });
    reload();
  };

  const incoming = rows.filter((r) => r.status === "pending" && r.direction === "incoming");
  const friends = rows.filter((r) => r.status === "accepted");
  const filtered = friends.filter((f) => f.displayName.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="absolute right-0 top-0 bottom-0 w-full sm:w-80 bg-white border-l border-gray-100 z-30 flex flex-col shadow-xl animate-slide-right">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="font-semibold text-gray-900 text-sm">Arkadaşlarım</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
      </div>

      <div className="px-4 py-3 border-b border-gray-100">
        <input value={q} onChange={(e) => setQ(e.target.value)} type="text" placeholder="Arama" className="w-full bg-gray-100 rounded-full px-4 py-2 text-sm outline-none" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <div className="text-center text-xs text-gray-400 mt-4">Yükleniyor…</div>}

        {incoming.length > 0 && (
          <>
            <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase">Yeni İstekler</p>
            {incoming.map((f) => (
              <div key={f.userId} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
                {f.photoUrl ? <img src={f.photoUrl} className="w-10 h-10 rounded-full object-cover" alt="" /> : <div className="w-10 h-10 rounded-full bg-gray-200" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{f.displayName}</p>
                  {f.country && <p className="text-xs text-gray-500">{f.country}</p>}
                </div>
                <button onClick={() => accept(f.userId)} className="bg-emerald-500 text-white text-xs px-3 py-1 rounded-full font-semibold">Kabul</button>
                <button onClick={() => remove(f.userId)} className="text-gray-400 text-xs px-2 py-1">Reddet</button>
              </div>
            ))}
          </>
        )}

        <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase">Arkadaşlar</p>
        {!loading && filtered.length === 0 && (
          <div className="text-center text-xs text-gray-400 mt-4 px-6">Henüz arkadaş yok. Keşfet'ten ekleyebilirsin.</div>
        )}
        {filtered.map((f) => (
          <div key={f.userId} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50">
            {f.photoUrl ? <img src={f.photoUrl} className="w-10 h-10 rounded-full object-cover flex-shrink-0" alt="" /> : <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500 flex-shrink-0">{f.displayName.charAt(0)}</div>}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{f.displayName}</p>
              {f.country && <p className="text-xs text-gray-500">{f.country}</p>}
            </div>
            <button
              onClick={() => onMessage?.({ userId: f.userId, displayName: f.displayName, photoUrl: f.photoUrl })}
              title="Mesaj Gönder"
              className="w-8 h-8 rounded-full bg-emerald-50 hover:bg-emerald-100 flex items-center justify-center text-emerald-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>
            <button onClick={() => remove(f.userId)} title="Sil" className="w-7 h-7 rounded-full hover:bg-red-50 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors text-xs">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Blocked Users Panel (#5)
// ─────────────────────────────────────────────
interface BlockedUser { userId: string; displayName: string; photoUrl: string | null; expiresAt: string | null; }
function BlockedPanel({ onClose }: { onClose: () => void }) {
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    fetch("/api/bans", { credentials: "include" })
      .then((r) => r.ok ? r.json() : { blocked: [] })
      .then((d: { blocked: BlockedUser[] }) => setBlocked(d.blocked || []))
      .finally(() => setLoading(false));
  };
  useEffect(reload, []);

  const unblock = async (userId: string) => {
    await fetch(`/api/bans/${userId}`, { method: "DELETE", credentials: "include" });
    reload();
  };

  return (
    <div className="absolute inset-0 bg-white z-50 flex flex-col animate-fade-in">
      <div className="flex items-center px-4 py-3 border-b border-gray-100">
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="ml-3 font-semibold text-gray-900">Engellediklerim</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center text-xs text-gray-400 mt-8">Yükleniyor…</div>
        ) : blocked.length === 0 ? (
          <div className="text-center text-xs text-gray-400 mt-10 px-6">Engellenmiş kullanıcı yok.</div>
        ) : blocked.map((u) => (
          <div key={u.userId} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
            {u.photoUrl ? (
              <img src={u.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500 text-sm">
                {u.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{u.displayName}</p>
              {u.expiresAt && (
                <p className="text-xs text-gray-400">
                  {new Date(u.expiresAt) > new Date()
                    ? `${new Date(u.expiresAt).toLocaleDateString("tr-TR")} tarihine kadar`
                    : "Engel süresi dolmuş"}
                </p>
              )}
            </div>
            <button onClick={() => unblock(u.userId)} className="text-xs text-red-500 hover:text-red-700 font-semibold flex-shrink-0">Engeli Kaldır</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Keşfet Tab Content (real online users)
// ─────────────────────────────────────────────
function KesfetPage() {
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [filterCountry, setFilterCountry] = useState<string>("Tümü");
  const [loading, setLoading] = useState(true);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/presence/online", { credentials: "include" })
        .then((r) => r.json())
        .then((d: { users: OnlineUser[] }) => { if (alive) setUsers(d.users || []); })
        .finally(() => { if (alive) setLoading(false); });
    };
    load();
    const t = setInterval(load, 10000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const sendFriend = async (peerId: string) => {
    if (requestedIds.has(peerId)) return;
    await fetch("/api/friends", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peerId }),
    }).catch(() => {});
    setRequestedIds((prev) => new Set(prev).add(peerId));
  };

  const tabs = ["Tümü", ...COUNTRIES.slice(0, 6)];
  const filtered = filterCountry === "Tümü" ? users : users.filter((u) => u.country === filterCountry);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex gap-2 px-4 py-3 border-b border-gray-200 overflow-x-auto flex-shrink-0 bg-white/80">
        {tabs.map((t) => (
          <button key={t} onClick={() => setFilterCountry(t)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              filterCountry === t ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}>{t}</button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && <div className="text-center text-gray-400 py-10">Yükleniyor…</div>}
        {!loading && filtered.length === 0 && (
          <div className="text-center text-gray-400 py-10">Şu an çevrimiçi kullanıcı yok.</div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((u) => (
            <div key={u.userId} className="relative rounded-2xl overflow-hidden bg-gray-100 aspect-[3/4] shadow-sm">
              {u.photoUrl ? (
                <img src={u.photoUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-emerald-200 to-teal-300 flex items-center justify-center text-4xl font-black text-white">
                  {u.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute top-2 left-2">
                <span className="bg-emerald-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">Çevrimiçi</span>
              </div>
              <div className="absolute bottom-2 left-2 right-2">
                <p className="text-white text-xs font-bold truncate">{u.displayName}{u.age ? `, ${u.age}` : ""}</p>
                {u.country && <p className="text-white/70 text-xs truncate">{u.country}</p>}
              </div>
              <button
                onClick={() => sendFriend(u.userId)}
                disabled={requestedIds.has(u.userId)}
                title={requestedIds.has(u.userId) ? "İstek gönderildi" : "Arkadaşlık iste"}
                className={`absolute bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center shadow-md transition-colors ${requestedIds.has(u.userId) ? "bg-gray-400 cursor-default" : "bg-emerald-500 hover:bg-emerald-600"}`}>
                <span className="text-white text-sm font-bold">{requestedIds.has(u.userId) ? "✓" : "+"}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Filter Modal — gender + country for matchmaking
// ─────────────────────────────────────────────
function FiltersModal({ filters, onChange, onClose }: { filters: Filters; onChange: (f: Filters) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Filters>(filters);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 px-2 animate-fade-in">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">Eşleşme Filtreleri</h2>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>

        <p className="text-xs font-semibold text-gray-600 mb-2">Cinsiyet</p>
        <div className="flex gap-2 mb-3">
          {(["any", "female", "male"] as const).map((g) => (
            <button key={g} onClick={() => setDraft({ ...draft, gender: g })}
              className={`flex-1 py-2 rounded-full text-sm font-semibold transition-colors ${draft.gender === g ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
              {g === "any" ? "Herkes" : g === "female" ? "Kadın" : "Erkek"}
            </button>
          ))}
        </div>

        {draft.gender === "female" && (
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 text-xs rounded-xl px-3 py-2.5 mb-3">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span><strong>Kadın filtresi:</strong> eşleşme başına <strong>20 coin</strong> düşülür.</span>
          </div>
        )}

        <p className="text-xs font-semibold text-gray-600 mb-2">Ülke</p>
        <select value={draft.country ?? ""} onChange={(e) => setDraft({ ...draft, country: e.target.value || null })}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-5">
          <option value="">Tümü</option>
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="flex items-center gap-2 bg-amber-50 text-amber-700 text-xs rounded-xl p-3 mb-4">
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01"/>
          </svg>
          Bazı filtreler coin gerektirebilir.
        </div>

        <button onClick={() => { onChange(draft); onClose(); }} className="w-full py-3 rounded-full bg-emerald-500 text-white font-bold">
          Uygula
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Coin History Modal
// ─────────────────────────────────────────────
interface CoinTx { id: number; amount: number; reason: string; createdAt: string }
function CoinHistoryModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<CoinTx[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/coins/history", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { transactions: CoinTx[] }) => setRows(d.transactions || []))
      .finally(() => setLoading(false));
  }, []);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-2 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 max-h-[80dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">Altın Geçmişi</h2>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        {loading ? <div className="text-center text-gray-400">Yükleniyor…</div> : rows.length === 0 ? (
          <div className="text-center text-gray-400 py-6">Henüz işlem yok.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between text-sm">
                <span className="text-gray-700">{r.reason}</span>
                <span className={r.amount > 0 ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
                  {r.amount > 0 ? "+" : ""}{r.amount} 🪙
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Terms of Service Modal
// ─────────────────────────────────────────────
function TermsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl max-h-[85dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-gray-900">Kullanım Koşulları</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 font-bold">✕</button>
        </div>
        <div className="prose prose-sm text-gray-600 space-y-4 text-sm leading-relaxed">
          <p className="font-semibold text-gray-800">Son güncelleme: Mayıs 2025</p>
          <p>1v1 Chat platformunu kullanarak aşağıdaki koşulları kabul etmiş olursunuz.</p>
          <h3 className="font-bold text-gray-800">1. Yaş Sınırı</h3>
          <p>Hizmetimizi kullanmak için 18 yaşından büyük olmanız gerekmektedir. 18 yaşından küçük kullanıcıların platforma erişimi kesinlikle yasaktır.</p>
          <h3 className="font-bold text-gray-800">2. Kabul Edilemez Davranışlar</h3>
          <ul className="list-disc ml-4 space-y-1">
            <li>Müstehcen içerik paylaşımı yasaktır</li>
            <li>Taciz, nefret söylemi ve tehdit yasaktır</li>
            <li>Başkalarının kimliğine bürünme yasaktır</li>
            <li>Spam ve reklam paylaşımı yasaktır</li>
            <li>Ekran kaydı ve görüntü yayını yasaktır</li>
          </ul>
          <h3 className="font-bold text-gray-800">3. Coin Sistemi</h3>
          <p>Satın alınan coinler iade edilmez. Hediye göndermek ve filtre kullanmak için coin harcanır. Hediye alan kullanıcılar değerin %30'unu coin olarak kazanır.</p>
          <h3 className="font-bold text-gray-800">4. Hesap Askıya Alma</h3>
          <p>Kural ihlallerinde hesabınız geçici veya kalıcı olarak askıya alınabilir. İhlaller diğer kullanıcılar tarafından raporlanabilir.</p>
          <h3 className="font-bold text-gray-800">5. Sorumluluk Sınırı</h3>
          <p>1v1 Chat, kullanıcılar arasındaki etkileşimlerden kaynaklanan zararlardan sorumlu değildir. Platformu kendi sorumluluğunuzda kullanırsınız.</p>
          <h3 className="font-bold text-gray-800">6. İletişim</h3>
          <p>Sorularınız için: <span className="text-blue-500">support@1v1chat.me</span></p>
        </div>
        <button onClick={onClose} className="mt-6 w-full py-3 rounded-full bg-gray-900 text-white font-semibold text-sm hover:bg-gray-700">Anladım</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Privacy Policy Modal
// ─────────────────────────────────────────────
function PrivacyModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl max-h-[85dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-gray-900">Gizlilik Politikası</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 font-bold">✕</button>
        </div>
        <div className="prose prose-sm text-gray-600 space-y-4 text-sm leading-relaxed">
          <p className="font-semibold text-gray-800">Son güncelleme: Mayıs 2025</p>
          <h3 className="font-bold text-gray-800">1. Topladığımız Veriler</h3>
          <ul className="list-disc ml-4 space-y-1">
            <li>Kimlik bilgileri (Replit Auth üzerinden: e-posta, ad)</li>
            <li>Profil bilgileri (görünen ad, yaş, cinsiyet, ülke, biyografi)</li>
            <li>Mesajlaşma verileri (DM geçmişi)</li>
            <li>Kullanım verileri (bağlantı istatistikleri, coin işlemleri)</li>
          </ul>
          <h3 className="font-bold text-gray-800">2. Verileri Nasıl Kullanırız</h3>
          <ul className="list-disc ml-4 space-y-1">
            <li>Hizmetleri sunmak ve geliştirmek için</li>
            <li>Hesap güvenliğini sağlamak için</li>
            <li>Kural ihlallerini tespit etmek için</li>
            <li>İsteğe bağlı e-posta bildirimleri göndermek için</li>
          </ul>
          <h3 className="font-bold text-gray-800">3. Veri Paylaşımı</h3>
          <p>Kişisel verilerinizi üçüncü taraflara satmıyor veya kiralamıyoruz. Yasal zorunluluklar dışında paylaşımımız yoktur.</p>
          <h3 className="font-bold text-gray-800">4. Çerezler</h3>
          <p>Oturum çerezleri kimlik doğrulama için kullanılır. Analitik çerez kullanmıyoruz.</p>
          <h3 className="font-bold text-gray-800">5. Veri Saklama</h3>
          <p>Hesabınız aktif olduğu sürece verileriniz saklanır. Hesap silme taleplerini support@1v1chat.me adresine iletebilirsiniz.</p>
          <h3 className="font-bold text-gray-800">6. Güvenlik</h3>
          <p>Tüm veriler şifreli bağlantılar (HTTPS) üzerinden iletilir ve güvenli sunucularda saklanır.</p>
          <h3 className="font-bold text-gray-800">7. İletişim</h3>
          <p>Gizlilik sorularınız için: <span className="text-blue-500">privacy@1v1chat.me</span></p>
        </div>
        <button onClick={onClose} className="mt-6 w-full py-3 rounded-full bg-gray-900 text-white font-semibold text-sm hover:bg-gray-700">Anladım</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Bottom Navigation Bar
// ─────────────────────────────────────────────
function BottomNav({ tab, setTab, unreadDms, onVideoChat }: {
  tab: Tab;
  setTab: (t: Tab) => void;
  unreadDms: number;
  onVideoChat: () => void;
}) {
  return (
    <nav className="bg-white border-t border-gray-100 flex items-center h-16 flex-shrink-0 z-40 relative">
      {/* Video Chat / Home */}
      <button
        onClick={onVideoChat}
        className={`flex-1 flex items-center justify-center h-full transition-colors ${tab === "home" ? "text-gray-900" : "text-gray-400"}`}
      >
        <svg className="w-7 h-7" fill={tab === "home" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </button>
      {/* Keşfet */}
      <button
        onClick={() => setTab("kesfet")}
        className={`flex-1 flex items-center justify-center h-full transition-colors ${tab === "kesfet" ? "text-gray-900" : "text-gray-400"}`}
      >
        <svg className="w-7 h-7" fill={tab === "kesfet" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.82m5.84-2.56a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.82m2.56-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
        </svg>
      </button>
      {/* Match / İlk İzlenimler */}
      <button
        onClick={() => setTab("match")}
        className={`flex-1 flex items-center justify-center h-full transition-colors ${tab === "match" ? "text-gray-900" : "text-gray-400"}`}
      >
        <svg className="w-7 h-7" fill={tab === "match" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
        </svg>
      </button>
      {/* Messages */}
      <button
        onClick={() => setTab("messages")}
        className={`flex-1 flex items-center justify-center h-full relative transition-colors ${tab === "messages" ? "text-gray-900" : "text-gray-400"}`}
      >
        <svg className="w-7 h-7" fill={tab === "messages" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
        </svg>
        {unreadDms > 0 && (
          <span className="absolute top-2.5 right-[calc(50%-22px)] w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
            {unreadDms > 9 ? "9+" : unreadDms}
          </span>
        )}
      </button>
    </nav>
  );
}

// ─────────────────────────────────────────────
// Match Page — İlk İzlenimler
// ─────────────────────────────────────────────
function MatchPage({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#ecfdf5] px-6 text-center">
      <div className="relative w-72 h-56 mb-10">
        <div className="absolute left-6 top-0 w-40 h-52 rounded-3xl overflow-hidden shadow-xl bg-gray-100">
          <img src="https://randomuser.me/api/portraits/men/32.jpg" alt="" className="w-full h-full object-cover" />
          <div className="absolute top-3 left-3 w-5 h-5 bg-blue-400 rounded-full opacity-90" />
        </div>
        <div className="absolute right-6 top-6 w-40 h-52 rounded-3xl overflow-hidden shadow-xl" style={{ filter: "blur(1.5px)" }}>
          <img src="https://randomuser.me/api/portraits/women/26.jpg" alt="" className="w-full h-full object-cover" />
          <div className="absolute top-3 right-3 w-5 h-5 bg-pink-400 rounded-full opacity-90" />
        </div>
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-10 w-12 h-12 bg-emerald-400 rounded-full flex items-center justify-center shadow-xl border-4 border-white">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h3.75l2.25-4.5 3 9 2.25-4.5H21" />
          </svg>
        </div>
      </div>
      <h1 className="text-2xl font-black text-gray-900 tracking-widest mb-5">İLK İZLENİMLER</h1>
      <p className="text-sm text-gray-500 leading-relaxed mb-10 max-w-xs">
        10 saniye içerisinde birbirinizden hoşlanıp hoşlanmadığınıza karar vereceksiniz. Kullanıcıdan hoşlandıysanız birbiriniz hakkında daha fazla şey öğrenmek için kalbe dokunun.
      </p>
      <StartBtn onClick={onStart}>Eşleştirmeye başla</StartBtn>
    </div>
  );
}

// ─────────────────────────────────────────────
// Settings Sheet — sağdan kayan panel
// ─────────────────────────────────────────────
function SettingsSheet({ onClose, onLogout, onShowBlocked, onShowTerms, onShowPrivacy }: {
  onClose: () => void;
  onLogout?: () => void;
  onShowBlocked: () => void;
  onShowTerms: () => void;
  onShowPrivacy: () => void;
}) {
  const items: { label: string; action: () => void }[] = [
    { label: "Hakkımızda", action: () => {} },
    { label: "Bize Ulaşın", action: () => {} },
    { label: "Topluluk Kuralları", action: () => {} },
    { label: "Kullanım Koşulları", action: onShowTerms },
    { label: "Gizlilik Politikası", action: onShowPrivacy },
    { label: "Rastgele Video Sohbet", action: () => {} },
    { label: "Engellenen Kullanıcılar", action: onShowBlocked },
  ];
  return (
    <div className="fixed inset-0 z-[60] flex justify-end" onClick={onClose}>
      <div
        className="bg-white h-full w-4/5 max-w-xs shadow-2xl flex flex-col animate-slide-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Ayarlar</h2>
          <button onClick={onClose} className="text-gray-500 font-bold text-xl leading-none">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => { item.action(); onClose(); }}
              className="w-full px-5 py-4 text-left text-base text-gray-800 hover:bg-gray-50 border-b border-gray-50 transition-colors"
            >
              {item.label}
            </button>
          ))}
          {onLogout && (
            <button
              onClick={() => { onLogout(); onClose(); }}
              className="w-full px-5 py-4 text-left text-base text-red-500 font-semibold"
            >
              Çıkış Yap
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Messages Tab Page — Mesajlarım + Arkadaşlarım
// ─────────────────────────────────────────────
function MessagesTabPage({ meId, authedUser, coins, onMarkRead, onOpenProfile, onOpenCoins, pendingFriends }: {
  meId: string;
  authedUser: { profileImageUrl: string | null; firstName: string | null } | null | undefined;
  coins: number;
  onMarkRead?: (count: number) => void;
  onOpenProfile: () => void;
  onOpenCoins: () => void;
  pendingFriends: number;
}) {
  const [subTab, setSubTab] = useState<"messages" | "friends">("messages");
  // ─── Messages state
  const [threads, setThreads] = useState<DmThread[]>([]);
  const [openPeer, setOpenPeer] = useState<DmThread | null>(null);
  const [msgs, setMsgs] = useState<DmMessage[]>([]);
  const [text, setText] = useState("");
  const [threadsLoading, setThreadsLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeenMsgIdRef = useRef<number>(-1);
  const isFirstFetchRef = useRef(true);
  // ─── Friends state
  const [rows, setRows] = useState<FriendRow[]>([]);
  const [q, setQ] = useState("");
  const [friendsLoading, setFriendsLoading] = useState(true);

  const loadThreads = () => {
    fetch("/api/dms", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { threads: DmThread[] }) => setThreads(d.threads || []))
      .finally(() => setThreadsLoading(false));
  };

  const reloadFriends = () => {
    setFriendsLoading(true);
    fetch("/api/friends", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { friends: FriendRow[] }) => setRows(d.friends || []))
      .finally(() => setFriendsLoading(false));
  };

  useEffect(() => { loadThreads(); reloadFriends(); }, []);

  const fetchMsgs = (peerId: string) =>
    fetch(`/api/dms/${peerId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { messages: DmMessage[] }) => {
        const OPTIMISTIC_THRESHOLD = 9_999_999_999;
        const serverMsgs = (d.messages || []).filter(
          (m) => typeof m.id === "number" && m.id <= OPTIMISTIC_THRESHOLD
        );
        setMsgs((prev) => {
          const pending = prev.filter(
            (m) => m.id > OPTIMISTIC_THRESHOLD && m.fromUserId === meId &&
              !serverMsgs.some((s) => s.text === m.text && s.fromUserId === meId)
          );
          return [...serverMsgs, ...pending];
        });
        if (!isFirstFetchRef.current && lastSeenMsgIdRef.current >= 0) {
          const newFromOther = serverMsgs.filter(
            (m) => m.id > lastSeenMsgIdRef.current && m.fromUserId !== meId
          );
          if (newFromOther.length > 0) playDmSound();
        }
        isFirstFetchRef.current = false;
        if (serverMsgs.length > 0) {
          lastSeenMsgIdRef.current = serverMsgs.reduce((max, m) => Math.max(max, m.id), lastSeenMsgIdRef.current);
        }
      });

  useEffect(() => {
    if (!openPeer) {
      pollingRef.current && clearInterval(pollingRef.current);
      lastSeenMsgIdRef.current = -1;
      isFirstFetchRef.current = true;
      return;
    }
    if (openPeer.unread > 0) onMarkRead?.(openPeer.unread);
    lastSeenMsgIdRef.current = -1;
    isFirstFetchRef.current = true;
    fetchMsgs(openPeer.peerId);
    pollingRef.current = setInterval(() => fetchMsgs(openPeer.peerId), 1000);
    return () => { pollingRef.current && clearInterval(pollingRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPeer?.peerId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  const send = async () => {
    if (!text.trim() || !openPeer) return;
    const body = text.trim();
    setText("");
    const tempMsg: DmMessage = { id: Date.now(), fromUserId: meId, toUserId: openPeer.peerId, text: body, createdAt: new Date().toISOString() };
    setMsgs((m) => [...m, tempMsg]);
    const res = await fetch("/api/dms", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: openPeer.peerId, body }),
    });
    if (res.ok) {
      const d = (await res.json()) as { message: DmMessage };
      setMsgs((m) => m.map((msg) => msg.id === tempMsg.id ? d.message : msg));
      loadThreads();
    }
  };

  const acceptFriend = async (peerId: string) => {
    await fetch(`/api/friends/${peerId}/accept`, { method: "POST", credentials: "include" });
    reloadFriends();
  };
  const removeFriend = async (peerId: string) => {
    await fetch(`/api/friends/${peerId}`, { method: "DELETE", credentials: "include" });
    reloadFriends();
  };

  const incomingReqs = rows.filter((r) => r.status === "pending" && r.direction === "incoming");
  const friends = rows.filter((r) => r.status === "accepted");
  const filteredFriends = friends.filter((f) => f.displayName.toLowerCase().includes(q.toLowerCase()));

  function fmtTime(iso: string | null) {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  }

  const AvatarBtn = () => (
    <button onClick={onOpenProfile} className="w-10 h-10 rounded-full overflow-hidden bg-orange-400 flex-shrink-0 flex items-center justify-center border-2 border-gray-100 shadow-sm">
      {authedUser?.profileImageUrl
        ? <img src={authedUser.profileImageUrl} alt="" className="w-full h-full object-cover" />
        : <span className="text-white font-bold text-sm">{authedUser?.firstName?.charAt(0)?.toUpperCase() ?? "?"}</span>
      }
    </button>
  );

  const CoinBtn = () => (
    <button
      onClick={onOpenCoins}
      className="flex items-center gap-1.5 flex-shrink-0 rounded-full px-3"
      style={{ background: "linear-gradient(135deg, #4ade80 0%, #a3e635 100%)", height: 30, boxShadow: "0 2px 6px rgba(74,222,128,0.35)" }}
    >
      <img src="/coin-icon.png" alt="coin" style={{ width: 18, height: 18, objectFit: "contain", flexShrink: 0 }} />
      <span className="font-extrabold text-black text-sm tracking-tight leading-none">{coins}</span>
    </button>
  );

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      {/* ─── Header ─── */}
      {openPeer ? (
        <div className="flex items-center px-4 py-3 border-b border-gray-100 flex-shrink-0 bg-white">
          <button
            onClick={() => { setOpenPeer(null); setMsgs([]); }}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 mr-2"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="flex-1 font-semibold text-gray-900 truncate">{openPeer.displayName}</span>
          <CoinBtn />
        </div>
      ) : (
        <div className="flex items-center px-4 py-3 border-b border-gray-100 flex-shrink-0 bg-white">
          <AvatarBtn />
          <div className="flex flex-1 items-center justify-center gap-6 mx-2">
            <button
              onClick={() => setSubTab("messages")}
              className={`text-sm font-bold pb-0.5 border-b-2 transition-colors ${subTab === "messages" ? "border-red-400 text-gray-900" : "border-transparent text-gray-400"}`}
            >Mesajlarım</button>
            <button
              onClick={() => setSubTab("friends")}
              className={`relative text-sm font-bold pb-0.5 border-b-2 transition-colors ${subTab === "friends" ? "border-red-400 text-gray-900" : "border-transparent text-gray-400"}`}
            >
              Arkadaşlarım
              {pendingFriends > 0 && (
                <span className="absolute -top-1 -right-5 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">{pendingFriends > 9 ? "9+" : pendingFriends}</span>
              )}
            </button>
          </div>
          <CoinBtn />
        </div>
      )}

      {/* ─── Content ─── */}
      {openPeer ? (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
            {msgs.length === 0 ? (
              <div className="text-center text-xs text-gray-400 mt-6">Henüz mesaj yok. İlk mesajı sen gönder!</div>
            ) : msgs.map((m) => {
              const mine = m.fromUserId === meId;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${mine ? "bg-emerald-500 text-white" : "bg-white text-gray-800 border border-gray-100"}`}>
                    {m.text}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
          <div className="p-3 border-t border-gray-100 flex gap-2 bg-white flex-shrink-0">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="Mesaj…"
              className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm outline-none"
            />
            <button onClick={send} className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>
        </>
      ) : subTab === "messages" ? (
        <div className="flex-1 overflow-y-auto bg-white">
          {incomingReqs.length > 0 && (
            <div
              onClick={() => setSubTab("friends")}
              className="flex items-center gap-4 px-4 py-4 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-pink-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">Yeni arkadaş istekleri</p>
              </div>
              <span className="w-6 h-6 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold flex-shrink-0">
                {incomingReqs.length > 9 ? "9+" : incomingReqs.length}
              </span>
            </div>
          )}
          {threadsLoading ? (
            <div className="text-center text-xs text-gray-400 mt-8">Yükleniyor…</div>
          ) : threads.length === 0 ? (
            <div className="text-center text-xs text-gray-400 mt-10 px-6">Henüz mesajlaşma yok. Keşfet'ten birine ulaşabilirsin.</div>
          ) : threads.map((t) => (
            <div
              key={t.peerId}
              onClick={() => setOpenPeer(t)}
              className="flex items-center gap-3 px-4 py-4 hover:bg-gray-50 cursor-pointer border-b border-gray-50 transition-colors"
            >
              <div className="relative flex-shrink-0">
                {t.photoUrl
                  ? <img src={t.photoUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
                  : <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500">{t.displayName.charAt(0)}</div>
                }
                <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900 truncate">{t.displayName}</p>
                  {t.lastAt && <p className="text-xs text-gray-400 flex-shrink-0 ml-2">{fmtTime(t.lastAt)}</p>}
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">{t.preview}</p>
              </div>
              {t.unread > 0 && (
                <span className="w-6 h-6 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold flex-shrink-0">
                  {t.unread > 9 ? "9+" : t.unread}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Friends sub-tab */
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3 flex-shrink-0">
            <div className="flex-1 flex items-center bg-gray-100 rounded-full px-4 py-2 gap-2">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input value={q} onChange={(e) => setQ(e.target.value)} type="text" placeholder="Ara" className="flex-1 bg-transparent text-sm outline-none" />
            </div>
            <button className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {friendsLoading && <div className="text-center text-xs text-gray-400 mt-8">Yükleniyor…</div>}
            {incomingReqs.length > 0 && (
              <>
                <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Yeni İstekler</p>
                {incomingReqs.map((f) => (
                  <div key={f.userId} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
                    {f.photoUrl
                      ? <img src={f.photoUrl} className="w-11 h-11 rounded-full object-cover" alt="" />
                      : <div className="w-11 h-11 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500">{f.displayName.charAt(0)}</div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{f.displayName}</p>
                      {f.country && <p className="text-xs text-gray-500">{f.country}</p>}
                    </div>
                    <button onClick={() => acceptFriend(f.userId)} className="bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-full font-semibold">Kabul</button>
                    <button onClick={() => removeFriend(f.userId)} className="text-gray-400 text-xs px-2 py-1">Reddet</button>
                  </div>
                ))}
              </>
            )}
            {!friendsLoading && filteredFriends.length === 0 && (
              <div className="text-center text-xs text-gray-400 mt-8 px-6">
                {q ? "Sonuç bulunamadı." : "Henüz arkadaş yok. Keşfet'ten arkadaş ekleyebilirsin."}
              </div>
            )}
            {filteredFriends.map((f) => (
              <div key={f.userId} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 transition-colors">
                {f.photoUrl
                  ? <img src={f.photoUrl} className="w-11 h-11 rounded-full object-cover flex-shrink-0" alt="" />
                  : <div className="w-11 h-11 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500 flex-shrink-0">{f.displayName.charAt(0)}</div>}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{f.displayName}</p>
                  {f.country && <p className="text-xs text-gray-500">{f.country}</p>}
                </div>
                <button
                  onClick={() => { setSubTab("messages"); setOpenPeer({ peerId: f.userId, displayName: f.displayName, photoUrl: f.photoUrl, preview: "", unread: 0, lastAt: null }); }}
                  className="w-9 h-9 rounded-full bg-emerald-50 hover:bg-emerald-100 flex items-center justify-center text-emerald-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </button>
                <button onClick={() => removeFriend(f.userId)} className="w-7 h-7 rounded-full hover:bg-red-50 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors text-sm">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Landing Component
// ─────────────────────────────────────────────
export default function Landing({ onStartChat, activeUsers, startLoggedIn = false, onLogin, onLogout, authedUser, coins = 0, filters, onFiltersChange, forceProfileOpen = false, onProfileSaved }: LandingProps) {
  const isLoggedIn = !!authedUser || startLoggedIn;
  const [modal, setModal]               = useState<Modal>("none");
  const [tab, setTab]                   = useState<Tab>("home");
  const [showProfile, setShowProfile]   = useState(forceProfileOpen);
  const [showSettings, setShowSettings] = useState(false);
  const [showBlocked, setShowBlocked]   = useState(false);
  const [langOpen, setLangOpen]         = useState(false);
  const [currentLang, setCurrentLang]   = useState<"tr" | "en" | "ar">(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("lang") : null;
    return (stored as "tr" | "en" | "ar") || "tr";
  });
  const handleLangChange = (lang: "tr" | "en" | "ar") => {
    setCurrentLang(lang);
    setLanguage(lang);
    setLangOpen(false);
  };
  const langLabels: Record<"tr" | "en" | "ar", string> = { tr: "Türkçe", en: "English", ar: "العربية" };

  useEffect(() => { if (forceProfileOpen) setShowProfile(true); }, [forceProfileOpen]);

  const [unreadDms, setUnreadDms]           = useState(0);
  const [pendingFriends, setPendingFriends] = useState(0);
  const prevUnreadRef = useRef<number | null>(null);
  const tabRef = useRef(tab);
  useEffect(() => { tabRef.current = tab; }, [tab]);

  const markDmsRead = (count: number) => {
    setUnreadDms((prev) => {
      const next = Math.max(0, prev - count);
      prevUnreadRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    const load = () => {
      fetch("/api/dms", { credentials: "include" })
        .then((r) => r.ok ? r.json() : null)
        .then((d: { threads: { unread: number }[] } | null) => {
          if (!d) return;
          const total = d.threads.reduce((s, t) => s + (t.unread || 0), 0);
          if (prevUnreadRef.current !== null && total > prevUnreadRef.current && tabRef.current !== "messages") {
            playDmSound();
          }
          prevUnreadRef.current = total;
          setUnreadDms(total);
        }).catch(() => {});
      fetch("/api/friends", { credentials: "include" })
        .then((r) => r.ok ? r.json() : null)
        .then((d: { friends: { status: string; direction: string }[] } | null) => {
          if (d) setPendingFriends(d.friends.filter((f) => f.status === "pending" && f.direction === "incoming").length);
        }).catch(() => {});
    };
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [isLoggedIn]);

  const handleCTA = () => {
    if (isLoggedIn) {
      if (forceProfileOpen) { setShowProfile(true); return; }
      onStartChat();
    } else {
      setModal("login");
    }
  };

  const handleLoginOption = () => { if (onLogin) onLogin(); else setModal("safety"); };
  const handleAgree = () => { setModal("none"); };

  const avatarEl = authedUser?.profileImageUrl
    ? <img src={authedUser.profileImageUrl} alt="" className="w-full h-full object-cover" />
    : <span className="text-white font-bold text-sm">{(authedUser?.firstName?.charAt(0) ?? "?").toUpperCase()}</span>;

  const CoinBadge = () => (
    <button
      onClick={() => setModal("coins")}
      className="flex items-center gap-1.5 flex-shrink-0 rounded-full px-3"
      style={{ background: "linear-gradient(135deg, #4ade80 0%, #a3e635 100%)", height: 30, boxShadow: "0 2px 8px rgba(74,222,128,0.35)" }}
    >
      <img src="/coin-icon.png" alt="coin" style={{ width: 18, height: 18, objectFit: "contain", flexShrink: 0 }} />
      <span className="font-extrabold text-black text-sm tracking-tight leading-none">{coins}</span>
    </button>
  );

  return (
    <div className="h-dvh flex flex-col overflow-hidden relative" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      {isLoggedIn ? (
        <>
          <div className="flex-1 flex overflow-hidden min-h-0">
          {/* ── Desktop Sidebar (hidden on mobile) ── */}
          <aside className="hidden md:flex flex-col w-52 bg-white border-r border-gray-100 shrink-0 py-5 px-3">
            <div className="flex items-center gap-2 px-1 mb-5">
              <Logo size={26} />
              <span className="font-black text-gray-900 text-sm">1v1 Chat</span>
            </div>
            <div className="flex items-center gap-2 px-1 mb-5">
              <button onClick={() => setShowProfile(true)} className="w-9 h-9 rounded-full overflow-hidden bg-orange-400 flex-shrink-0 flex items-center justify-center border-2 border-white shadow-sm">
                {avatarEl}
              </button>
              <CoinBadge />
            </div>
            <nav className="flex flex-col gap-0.5">
              <button onClick={handleCTA} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${tab === "home" ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"}`}>
                <svg className="w-5 h-5 shrink-0" fill={tab === "home" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                </svg>
                Video Sohbet
              </button>
              <button onClick={() => setTab("kesfet")} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${tab === "kesfet" ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"}`}>
                <svg className="w-5 h-5 shrink-0" fill={tab === "kesfet" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.82m5.84-2.56a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.82m2.56-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                </svg>
                Keşfet
              </button>
              <button onClick={() => setTab("match")} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${tab === "match" ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"}`}>
                <svg className="w-5 h-5 shrink-0" fill={tab === "match" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
                Eşleş
              </button>
              <button onClick={() => setTab("messages")} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${tab === "messages" ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"}`}>
                <svg className="w-5 h-5 shrink-0" fill={tab === "messages" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                </svg>
                Mesajlar
                {unreadDms > 0 && <span className="ml-auto w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">{unreadDms > 9 ? "9+" : unreadDms}</span>}
              </button>
            </nav>
          </aside>
          {/* ── Main content ── */}
          <div className="flex-1 flex flex-col overflow-hidden relative min-h-0">

            {/* HOME TAB */}
            {tab === "home" && (
              <div className="flex-1 relative overflow-hidden bg-[#ecfdf5]">
                <div className="md:hidden absolute top-0 left-0 right-0 z-20 px-4 pt-3 flex items-center gap-2">
                  <button onClick={() => setShowProfile(true)} className="w-10 h-10 rounded-full overflow-hidden bg-orange-400 flex-shrink-0 flex items-center justify-center border-2 border-white shadow-md">
                    {avatarEl}
                  </button>
                  <CoinBadge />
                </div>
                <div className="absolute inset-0">
                  <PhotoCollage />
                </div>
                <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-white via-white/92 to-transparent pt-14 pb-6 px-6">
                  <h1 className="text-3xl font-black text-gray-900">Yüz Yüze</h1>
                  <p className="text-sm text-gray-500 mt-1 mb-5">Başlamak için tuşa tıkla</p>
                  <StartBtn onClick={handleCTA}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                    Görüntülü Sohbete Başla
                  </StartBtn>
                  {activeUsers > 0 && (
                    <p className="mt-3 text-xs text-gray-400 flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                      {activeUsers} kişi şu an çevrimiçi
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* KEŞFET TAB */}
            {tab === "kesfet" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="md:hidden flex items-center gap-2 px-4 pt-3 pb-2 flex-shrink-0 bg-white border-b border-gray-100">
                  <button onClick={() => setShowProfile(true)} className="w-10 h-10 rounded-full overflow-hidden bg-orange-400 flex-shrink-0 flex items-center justify-center border-2 border-white shadow-sm">
                    {avatarEl}
                  </button>
                  <CoinBadge />
                </div>
                <KesfetPage />
              </div>
            )}

            {/* MATCH TAB */}
            {tab === "match" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="md:hidden flex items-center gap-2 px-4 pt-3 pb-2 flex-shrink-0 bg-white border-b border-gray-100">
                  <button onClick={() => setShowProfile(true)} className="w-10 h-10 rounded-full overflow-hidden bg-orange-400 flex-shrink-0 flex items-center justify-center border-2 border-white shadow-sm">
                    {avatarEl}
                  </button>
                  <CoinBadge />
                </div>
                <MatchPage onStart={handleCTA} />
              </div>
            )}

            {/* MESSAGES TAB */}
            {tab === "messages" && authedUser && (
              <MessagesTabPage
                meId={authedUser.id}
                authedUser={authedUser}
                coins={coins}
                onMarkRead={markDmsRead}
                onOpenProfile={() => setShowProfile(true)}
                onOpenCoins={() => setModal("coins")}
                pendingFriends={pendingFriends}
              />
            )}
          {/* ── Mobile Bottom Navigation ── */}
          <div className="md:hidden">
            <BottomNav tab={tab} setTab={setTab} unreadDms={unreadDms} onVideoChat={handleCTA} />
          </div>
          </div>
          </div>

          {/* ── Profile overlay ── */}
          {showProfile && (
            <div className="absolute inset-0 z-50">
              <ProfilePage
                onClose={() => setShowProfile(false)}
                onSaved={onProfileSaved}
                onOpenSettings={() => setShowSettings(true)}
                coins={coins}
                onOpenCoins={() => setModal("coins")}
              />
            </div>
          )}

          {/* ── Blocked overlay ── */}
          {showBlocked && (
            <div className="absolute inset-0 z-50">
              <BlockedPanel onClose={() => setShowBlocked(false)} />
            </div>
          )}

          {/* ── Settings sheet ── */}
          {showSettings && (
            <SettingsSheet
              onClose={() => setShowSettings(false)}
              onLogout={onLogout}
              onShowBlocked={() => { setShowSettings(false); setShowBlocked(true); }}
              onShowTerms={() => { setShowSettings(false); setModal("terms"); }}
              onShowPrivacy={() => { setShowSettings(false); setModal("privacy"); }}
            />
          )}
        </>
      ) : (
        /* ── Guest screen ── */
        <>
          <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-4 flex-shrink-0 z-30 relative">
            <div className="flex items-center gap-2.5">
              <Logo size={32} />
              <span className="font-black text-gray-900 text-lg">1v1 Chat</span>
            </div>
            <nav className="hidden md:flex items-center gap-5 text-sm text-gray-600 font-medium ml-4">
              {["Ev", "Hakkımızda", "Video Sohbeti", "İndirmek", "Bize Ulaşın"].map((l) => (
                <a key={l} href="#" className="hover:text-gray-900 transition-colors">{l}</a>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <div className="relative">
                <button
                  onClick={() => setLangOpen((v) => !v)}
                  className="border border-gray-200 rounded-full px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-1"
                >
                  {langLabels[currentLang]} ▾
                </button>
                {langOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden min-w-[110px]">
                    {(["tr", "en", "ar"] as const).map((l) => (
                      <button
                        key={l}
                        onClick={() => handleLangChange(l)}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${currentLang === l ? "font-semibold text-gray-900" : "text-gray-600"}`}
                      >
                        {langLabels[l]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setModal("login")} className="flex items-center gap-2 bg-gray-900 text-white rounded-full px-4 py-1.5 text-sm font-semibold hover:bg-gray-700 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                Giriş Yap
              </button>
            </div>
          </header>
          <div className="flex-1 flex overflow-hidden relative" style={{ backgroundColor: "#ecfdf5" }}>
            <div className="flex-1 flex flex-col justify-center px-6 sm:px-10 lg:px-16 py-8 min-w-0 z-10">
              <h1 className="text-4xl lg:text-5xl font-black text-gray-900 leading-tight mb-3">
                Bire Bir<br />Görüntülü Sohbet
              </h1>
              <p className="text-gray-600 text-sm lg:text-base mb-8 max-w-xs leading-relaxed">
                1v1Chat - Bire Bir Sohbet Edin ve Çevrimiçi Yeni İnsanlarla Tanışın
              </p>
              <StartBtn onClick={handleCTA}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                </svg>
                Video görüşmesini başlat
              </StartBtn>
              {activeUsers > 0 && (
                <p className="mt-5 text-sm text-gray-500 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                  {activeUsers} kişi şu an çevrimiçi
                </p>
              )}
            </div>
            <div className="hidden md:flex flex-col justify-start overflow-hidden" style={{ width: "55%", flexShrink: 0 }}>
              <PhotoCollage />
            </div>
          </div>
        </>
      )}

      {/* ── Global Modals ── */}
      {modal === "login"        && <LoginModal      onClose={() => setModal("none")} onContinue={handleLoginOption} onTerms={() => setModal("terms")} onPrivacy={() => setModal("privacy")} />}
      {modal === "safety"       && <SafetyModal     onAgree={handleAgree} />}
      {modal === "coins"        && <CoinsModal      onClose={() => setModal("none")} />}
      {modal === "coin-history" && <CoinHistoryModal onClose={() => setModal("none")} />}
      {modal === "terms"        && <TermsModal      onClose={() => setModal("none")} />}
      {modal === "privacy"      && <PrivacyModal    onClose={() => setModal("none")} />}
      {modal === "filters" && filters && onFiltersChange && (
        <FiltersModal filters={filters} onChange={onFiltersChange} onClose={() => setModal("none")} />
      )}
    </div>
  );
}
