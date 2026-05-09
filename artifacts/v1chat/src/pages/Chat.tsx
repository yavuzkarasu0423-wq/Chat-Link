import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { io, Socket } from "socket.io-client";
import SimplePeer from "simple-peer";
import Landing from "./Landing";
import BroadcasterDashboard from "./BroadcasterDashboard";
import { useAuth } from "@workspace/replit-auth-web";
import { GiftOverlay, type GiftOverlayHandle } from "../components/GiftOverlay";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type Phase = "lobby" | "waiting" | "connecting" | "connected" | "idle";
type Gender = "any" | "male" | "female";
type Region = "global" | "local";

export interface Filters {
  gender: Gender;
  region: Region;
  country?: string | null;
}

interface Message {
  id: string;
  text: string;
  from: "me" | "stranger";
  timestamp: Date;
}

interface SessionStats {
  matchCount: number;
  totalTalkSeconds: number;
  activeUsers: number;
}


// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const STUN_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 10,
};

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280, max: 1280 },
  height: { ideal: 720, max: 720 },
  frameRate: { ideal: 30, max: 30 },
};

const DEFAULT_FILTERS: Filters = { gender: "any", region: "global" };

const GIFT_SHORTCUTS = [
  { emoji: "💋", coins: 30 },
  { emoji: "🥰", coins: 30 },
  { emoji: "🌹", coins: 30 },
  { emoji: "🎁", coins: 30 },
  { emoji: "💣", coins: 30 },
  { emoji: "🍑", coins: 30 },
];

const GIFTS = [
  { emoji: "💋", coins: 30 }, { emoji: "😘", coins: 30 }, { emoji: "🥰", coins: 30 }, { emoji: "🫶", coins: 30 },
  { emoji: "💣", coins: 30 }, { emoji: "🍑", coins: 30 }, { emoji: "😎", coins: 30 }, { emoji: "💔", coins: 30 },
  { emoji: "🌹", coins: 50 }, { emoji: "🌸", coins: 100 }, { emoji: "🎸", coins: 200 }, { emoji: "🐻", coins: 300 },
  { emoji: "💎", coins: 500 }, { emoji: "💐", coins: 800 }, { emoji: "🎁", coins: 800 }, { emoji: "👑", coins: 2000 },
  { emoji: "🚀", coins: 3000 }, { emoji: "📿", coins: 3000 }, { emoji: "💍", coins: 4000 }, { emoji: "✈️", coins: 8000 },
  { emoji: "🎯", coins: 10000 },
];

const REPORT_REASONS = [
  "Yetişkin İçerikler",
  "Şüpheli Faaliyetler",
  "Kimlik Hırsızlığı",
  "Taciz",
  "Reşit olmayan kullanıcı",
  "Yasa Dışı Faaliyetler",
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function formatTimer(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// Convert emoji to Twemoji codepoint (strips variation selectors)
function emojiToCodepoint(emoji: string): string {
  return [...emoji]
    .map((c) => c.codePointAt(0))
    .filter((cp): cp is number => cp != null && cp !== 0xfe0f)
    .map((cp) => cp.toString(16))
    .join("-");
}

// Sharp emoji renderer using Twemoji SVG (CDN)
function Twemoji({ emoji, size = 28, className = "" }: { emoji: string; size?: number; className?: string }) {
  const cp = emojiToCodepoint(emoji);
  return (
    <img
      src={`https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${cp}.svg`}
      alt={emoji}
      width={size}
      height={size}
      draggable={false}
      className={`inline-block select-none ${className}`}
      style={{ width: size, height: size }}
      onError={(e) => {
        // Fallback to native emoji if Twemoji asset is missing
        const img = e.currentTarget;
        const span = document.createElement("span");
        span.textContent = emoji;
        span.style.fontSize = `${size}px`;
        span.style.lineHeight = "1";
        img.replaceWith(span);
      }}
    />
  );
}

// ─────────────────────────────────────────────
// Network Quality Badge
// ─────────────────────────────────────────────
function NetworkBadge({ poor }: { poor: boolean }) {
  if (!poor) return null;
  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-amber-400 text-xs font-medium px-2.5 py-1 rounded-full border border-amber-500/30 z-30">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      Zayıf Bağlantı
    </div>
  );
}

// ─────────────────────────────────────────────
// Waiting Screen
// ─────────────────────────────────────────────
const FLOAT_CIRCLES = [
  { img: "https://randomuser.me/api/portraits/women/28.jpg", size: 56, style: { left: "12%", top: "22%", animation: "floatCircle1 8s ease-in-out infinite" } },
  { img: "https://randomuser.me/api/portraits/men/35.jpg", size: 48, style: { left: "78%", top: "16%", animation: "floatCircle2 11s ease-in-out infinite" } },
  { img: "https://randomuser.me/api/portraits/women/62.jpg", size: 52, style: { left: "6%", top: "62%", animation: "floatCircle3 9s ease-in-out infinite" } },
  { img: "https://randomuser.me/api/portraits/men/71.jpg", size: 44, style: { left: "82%", top: "68%", animation: "floatCircle1 12s ease-in-out infinite 2s" } },
  { img: "https://randomuser.me/api/portraits/women/15.jpg", size: 60, style: { left: "72%", top: "42%", animation: "floatCircle2 7s ease-in-out infinite 1s" } },
  { img: "https://randomuser.me/api/portraits/men/48.jpg", size: 40, style: { left: "22%", top: "78%", animation: "floatCircle3 10s ease-in-out infinite 3s" } },
  { img: "https://randomuser.me/api/portraits/women/41.jpg", size: 50, style: { left: "48%", top: "8%", animation: "floatCircle1 14s ease-in-out infinite 0.5s" } },
  { img: "https://randomuser.me/api/portraits/men/18.jpg", size: 38, style: { left: "38%", top: "84%", animation: "floatCircle2 9s ease-in-out infinite 4s" } },
];

function WaitingScreen({ onStop, displayName, photoUrl, country, isConnecting, subtitle }: {
  onStop: () => void;
  displayName?: string;
  photoUrl?: string | null;
  country?: string | null;
  isConnecting?: boolean;
  subtitle?: string | null;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (isConnecting) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isConnecting]);

  const COUNTRY_FLAGS: Record<string, string> = {
    "Türkiye": "🇹🇷", "Türkiye ": "🇹🇷", "Ukrayna": "🇺🇦", "Rusya": "🇷🇺",
    "Almanya": "🇩🇪", "Amerika": "🇺🇸", "İngiltere": "🇬🇧", "Fransa": "🇫🇷",
    "İtalya": "🇮🇹", "İspanya": "🇪🇸",
  };
  const flag = country ? (COUNTRY_FLAGS[country] ?? "🌍") : null;

  return (
    <div
      className="h-dvh flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, #d1fae5 0%, #a7f3d0 40%, #6ee7b7 100%)", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
    >
      {/* X close button */}
      <button
        onClick={onStop}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/70 backdrop-blur-sm flex items-center justify-center text-gray-500 hover:bg-white transition-colors shadow-md z-10 text-lg font-bold"
      >
        ✕
      </button>

      {/* Floating circles when actually searching */}
      {!isConnecting && FLOAT_CIRCLES.map((c, i) => (
        <div
          key={i}
          className="absolute rounded-full overflow-hidden border-4 border-white shadow-lg"
          style={{ width: c.size, height: c.size, ...c.style }}
        >
          <img src={c.img} className="w-full h-full object-cover" alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        </div>
      ))}

      <div className="flex flex-col items-center gap-6 z-10 px-6 text-center">
        <h2 className="text-xl font-bold text-gray-800">
          {isConnecting ? "Bağlantı sağlanıyor..." : "Kullanıcılar aranıyor..."}
        </h2>
        {subtitle && (
          <div className="flex items-center gap-2 bg-white/80 backdrop-blur-sm text-gray-700 text-sm font-medium px-4 py-2 rounded-full shadow-sm border border-white/90 -mt-3">
            <span>👋</span>
            <span>{subtitle}</span>
          </div>
        )}

        {/* Profile photo with spinner ring */}
        <div className="relative w-44 h-44 flex items-center justify-center">
          {/* Outer spinner arc */}
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 176 176">
            <circle cx="88" cy="88" r="82" fill="none" stroke="#d1fae5" strokeWidth="6" />
            <circle
              cx="88" cy="88" r="82" fill="none"
              stroke="url(#spinGrad)" strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray="220 320"
              style={{ animation: "spinRing 1.4s linear infinite" }}
            />
            <defs>
              <linearGradient id="spinGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#86efac" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
            </defs>
          </svg>
          {/* Profile photo */}
          <div className="w-36 h-36 rounded-full overflow-hidden bg-orange-400 flex items-center justify-center shadow-2xl border-4 border-white">
            {photoUrl
              ? <img src={photoUrl} className="w-full h-full object-cover" alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              : <span className="text-white font-black text-5xl">{(displayName ?? "?").charAt(0).toUpperCase()}</span>
            }
          </div>
        </div>

        {/* Name */}
        <div className="flex flex-col items-center gap-1">
          <p className="text-2xl font-black text-gray-900">{displayName ?? "..."}</p>
          {flag && country && (
            <p className="text-sm text-gray-600 flex items-center gap-1.5">
              <span className="text-lg">{flag}</span>
              <span>{country}</span>
            </p>
          )}
        </div>

        {/* Wait timer (only during search) */}
        {!isConnecting && (
          <div className="flex items-center gap-3 bg-white/70 backdrop-blur-sm px-5 py-2.5 rounded-full shadow-sm border border-white/80 mt-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <span className="text-xs text-gray-600 font-medium">
              {elapsed < 5 ? "Eşleşme aranıyor…" : elapsed < 30 ? `${elapsed}sn — hemen bulunacak` : `${Math.floor(elapsed / 60)}dk ${elapsed % 60}sn`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Chat Component
// ─────────────────────────────────────────────
interface ChatProps {
  onLogin?: () => void;
  onLogout?: () => void;
  authedUser?: { id: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null } | null;
}

export default function Chat(props: ChatProps = {}) {
  const { user, isLoading, login, logout } = useAuth();

  const authedUser = props.authedUser !== undefined
    ? props.authedUser
    : (user ? {
        id: user.id,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
        profileImageUrl: user.profileImageUrl ?? null,
      } : null);

  const onLogin = props.onLogin ?? login;
  const onLogout = props.onLogout ?? logout;
  const [phase, setPhase] = useState<Phase>("lobby");
  const phaseRef = useRef<Phase>("lobby");
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const isAudioMutedRef = useRef(false);
  const isVideoOffRef = useRef(false);
  useEffect(() => { isAudioMutedRef.current = isAudioMuted; }, [isAudioMuted]);
  useEffect(() => { isVideoOffRef.current = isVideoOff; }, [isVideoOff]);
  const [reportSent, setReportSent] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [networkPoor, setNetworkPoor] = useState(false);
  const [remoteVideoKey, setRemoteVideoKey] = useState(0);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  // keep filtersRef in sync for use inside peer close callback
  useEffect(() => { filtersRef.current = filters; }, [filters]);
  const [partnerUserId, setPartnerUserId] = useState<string | null>(null);
  const partnerUserIdRef = useRef<string | null>(null);
  useEffect(() => { partnerUserIdRef.current = partnerUserId; }, [partnerUserId]);
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const [stats, setStats] = useState<SessionStats>({ matchCount: 0, totalTalkSeconds: 0, activeUsers: 0 });
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [coins, setCoins] = useState(0);
  // Video kalite seçeneği (#13)
  const [videoQuality, setVideoQuality] = useState<"hd" | "sd">("hd");
  // Profile check — yeni kullanıcı profil oluşturmadan başlayamaz
  const [needsProfile, setNeedsProfile] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);
  // Bug 7 fix: kendi profil bilgisi — WaitingScreen'de avatar için
  const [myProfile, setMyProfile] = useState<{ displayName: string; photoUrl: string | null } | null>(null);
  // Friend request in chat
  const [friendRequested, setFriendRequested] = useState(false);
  // Incoming friend request from partner
  const [incomingFriendReq, setIncomingFriendReq] = useState<{ fromName: string; fromUserId: string } | null>(null);
  // Filter coin warning toast
  const [filterCoinToast, setFilterCoinToast] = useState<string | null>(null);
  const [partnerLeftMsg, setPartnerLeftMsg] = useState<string | null>(null);
  // In-call coin purchase modal
  const [showBuyCoins, setShowBuyCoins] = useState(false);
  const [buyCoinsLoading, setBuyCoinsLoading] = useState<string | null>(null);
  // Partner profili — eşleşince çekilen gerçek bilgiler
  const [partnerProfile, setPartnerProfile] = useState<{
    displayName: string; age: number | null; gender: string | null;
    country: string | null; interests: string[]; photoUrl: string | null;
  } | null>(null);

  // Bug 4 fix: presence ping — kullanıcıyı Keşfet'te görünür kıl
  useEffect(() => {
    if (!authedUser) return;
    const ping = () => fetch("/api/presence/ping", { method: "POST", credentials: "include" }).catch(() => {});
    ping();
    const t = setInterval(ping, 25000);
    return () => {
      clearInterval(t);
      fetch("/api/presence/leave", { method: "POST", credentials: "include" }).catch(() => {});
    };
  }, [authedUser]);

  // Fix 1: Profil kontrolü — giriş yapan ama profili olmayan kullanıcıyı profil kurulumuna yönlendir
  useEffect(() => {
    if (!authedUser) { setProfileChecked(true); return; }
    fetch("/api/profile/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { profile: { displayName: string; photoUrl: string | null } | null }) => {
        setNeedsProfile(!d.profile);
        setProfileChecked(true);
        // Bug 7 fix: WaitingScreen için kendi profil bilgisini sakla
        if (d.profile) setMyProfile({ displayName: d.profile.displayName, photoUrl: d.profile.photoUrl });
      })
      .catch(() => setProfileChecked(true));
  }, [authedUser?.id]);

  // PiP düzeltme: connected phase'e her geçişte local stream'i video elementine bağla
  useEffect(() => {
    if (phase === "connected" && localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [phase]);

  // Check broadcaster role
  useEffect(() => {
    if (!authedUser) return;
    fetch("/api/broadcasters/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { profile?: unknown; error?: string }) => {
        setIsBroadcaster(!d.error && d.profile !== null);
      })
      .catch(() => {});
  }, [authedUser?.id]);

  // Load coin balance from API once authed
  useEffect(() => {
    if (!authedUser) return;
    let cancelled = false;
    fetch("/api/coins/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.balance === "number") setCoins(d.balance);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authedUser]);

  // New: partner status & engagement
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [partnerAudioOn, setPartnerAudioOn] = useState(true);
  const [partnerVideoOn, setPartnerVideoOn] = useState(true);
  const giftOverlayRef = useRef<GiftOverlayHandle>(null);
  const [coinFlash, setCoinFlash] = useState(false);
  // Bug 7: WebRTC reconnect
  const [webrtcReconnecting, setWebrtcReconnecting] = useState(false);
  const peerCloseIntentionalRef = useRef(false);
  const reconnectCountRef = useRef(0);
  const filtersRef = useRef<Filters>(DEFAULT_FILTERS);
  const [dmToast, setDmToast] = useState<{ fromDisplayName: string; preview: string } | null>(null);
  const [announceToast, setAnnounceToast] = useState<string | null>(null);
  const [isBroadcaster, setIsBroadcaster] = useState(false);
  const [showBroadcasterDashboard, setShowBroadcasterDashboard] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<SimplePeer.Instance | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteBgVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingSignalsRef = useRef<SimplePeer.SignalData[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const netStatsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const matchStartRef = useRef<number>(0);
  const typingEmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partnerTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Call timer
  useEffect(() => {
    if (phase !== "connected") { setCallSeconds(0); return; }
    const t = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Kamera düzeltme: video elementleri "connected" fazına geçince mount olur.
  // srcObject, mount öncesi atandıysa null'a düştüğünden, mount sonrası yeniden ata.
  useEffect(() => {
    if (phase !== "connected") return;
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
    if (remoteBgVideoRef.current && remoteStreamRef.current) {
      remoteBgVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [phase]);

  // Visibility API
  useEffect(() => {
    const handleVisibility = () => {
      const hidden = document.visibilityState === "hidden";
      setTabHidden(hidden);
      if (!localStreamRef.current) return;
      localStreamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = hidden ? false : !isVideoOff;
      });
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isVideoOff]);

  // Network quality monitor
  const startNetworkMonitor = useCallback(() => {
    if (netStatsIntervalRef.current) clearInterval(netStatsIntervalRef.current);
    netStatsIntervalRef.current = setInterval(async () => {
      if (!peerRef.current || peerRef.current.destroyed) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pc = (peerRef.current as any)._pc as RTCPeerConnection | undefined;
      if (!pc) return;
      try {
        const rtcStats = await pc.getStats();
        let highRTT = false;
        let highLoss = false;
        rtcStats.forEach((r) => {
          if (r.type === "candidate-pair" && (r as RTCIceCandidatePairStats).state === "succeeded") {
            const rtt = (r as RTCIceCandidatePairStats).currentRoundTripTime;
            if (rtt != null && rtt > 0.35) highRTT = true;
          }
          if (r.type === "inbound-rtp" && (r as RTCInboundRtpStreamStats).kind === "video") {
            const s = r as RTCInboundRtpStreamStats;
            const total = (s.packetsReceived ?? 0) + (s.packetsLost ?? 0);
            if (total > 20 && (s.packetsLost ?? 0) / total > 0.05) highLoss = true;
          }
        });
        setNetworkPoor(highRTT || highLoss);
      } catch { /* connection closing */ }
    }, 3000);
  }, []);

  const stopNetworkMonitor = useCallback(() => {
    if (netStatsIntervalRef.current) { clearInterval(netStatsIntervalRef.current); netStatsIntervalRef.current = null; }
    setNetworkPoor(false);
  }, []);

  const updateTalkStats = useCallback(() => {
    if (matchStartRef.current > 0) {
      const elapsed = Math.floor((Date.now() - matchStartRef.current) / 1000);
      setStats((s) => ({ ...s, totalTalkSeconds: s.totalTalkSeconds + elapsed }));
      matchStartRef.current = 0;
    }
  }, []);

  const destroyPeer = useCallback(() => {
    stopNetworkMonitor();
    updateTalkStats();
    peerCloseIntentionalRef.current = true;
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
    // Son frame'i anında temizle: srcObject null + load() zorlar
    if (remoteVideoRef.current) { remoteVideoRef.current.srcObject = null; remoteVideoRef.current.load(); }
    if (remoteBgVideoRef.current) { remoteBgVideoRef.current.srcObject = null; remoteBgVideoRef.current.load(); }
    // Video elementini yeniden mount ederek tarayıcı cache'ini temizle
    setRemoteVideoKey((k) => k + 1);
    setPartnerTyping(false);
    setPartnerAudioOn(true);
    setPartnerVideoOn(true);
    if (partnerTypingTimerRef.current) { clearTimeout(partnerTypingTimerRef.current); partnerTypingTimerRef.current = null; }
  }, [stopNetworkMonitor, updateTalkStats]);

  const createPeer = useCallback(
    (initiator: boolean, stream: MediaStream) => {
      destroyPeer();
      pendingSignalsRef.current = [];
      const peer = new SimplePeer({ initiator, stream, trickle: true, config: STUN_SERVERS });

      peer.on("signal", (signal) => { socketRef.current?.emit("signal", { signal }); });

      // Drain buffered signals that arrived before peer was ready
      peerRef.current = peer;
      pendingSignalsRef.current.forEach((s) => { if (!peer.destroyed) peer.signal(s); });
      pendingSignalsRef.current = [];

      peer.on("stream", (remoteStream) => {
        remoteStreamRef.current = remoteStream;
        // Video elementleri henüz mount olmayabilir (connecting→connected geçişi)
        // useEffect(phase) mount sonrası srcObject'i yeniden atar
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
        if (remoteBgVideoRef.current) remoteBgVideoRef.current.srcObject = remoteStream;
        setPhase("connected");
        startNetworkMonitor();
        matchStartRef.current = Date.now();
        socketRef.current?.emit("media-state", { audio: !isAudioMutedRef.current, video: !isVideoOffRef.current });
      });

      // Bug 2 fix: error VE close aynı anda tetiklenebilir — yalnızca biri reconnect başlatmalı
      let reconnectTriggered = false;
      const scheduleReconnect = () => {
        if (reconnectTriggered || peerCloseIntentionalRef.current || reconnectCountRef.current >= 3) return;
        reconnectTriggered = true;
        reconnectCountRef.current += 1;
        setWebrtcReconnecting(true);
        setTimeout(() => {
          setWebrtcReconnecting(false);
          setPhase("waiting");
          socketRef.current?.emit("find-match", { filters: filtersRef.current });
        }, 3000);
      };

      peer.on("error", () => {
        setNetworkPoor(true);
        scheduleReconnect();
      });
      peer.on("close", () => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        if (remoteBgVideoRef.current) remoteBgVideoRef.current.srcObject = null;
        stopNetworkMonitor();
        scheduleReconnect();
        peerCloseIntentionalRef.current = false;
      });
    },
    [destroyPeer, startNetworkMonitor]
  );

  const getLocalStream = useCallback(async (): Promise<MediaStream | null> => {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS, audio: true });
      stream.getVideoTracks().forEach((track) => {
        if ("contentHint" in track) (track as MediaStreamTrack & { contentHint: string }).contentHint = "motion";
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setMediaError(null);
      return stream;
    } catch {
      setMediaError("Kamera veya mikrofon erişimi reddedildi. Lütfen tarayıcı izinlerinizi kontrol edin.");
      return null;
    }
  }, []);

  // Socket.IO
  useEffect(() => {
    if (!authedUser) return;
    const socket = io("/", {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      auth: { userId: authedUser.id },
    });
    socketRef.current = socket;

    socket.on("waiting", () => {
      setPhase("waiting");
      setMessages([]);
      setReportSent(false);
      destroyPeer();
    });

    socket.on("matched", async ({ initiator, partnerUserId: pid }: { roomId: string; initiator: boolean; partnerUserId?: string }) => {
      // Bug 3 fix: Yeni eşleşme kurulunca reconnect sayacını sıfırla
      reconnectCountRef.current = 0;
      setPhase("connecting");
      setMessages([]);
      setReportSent(false);
      setFriendRequested(false);
      setIncomingFriendReq(null);
      setShowGiftPanel(false);
      setShowReportModal(false);
      setRemoteVideoKey((k) => k + 1);
      remoteStreamRef.current = null;
      setPartnerUserId(pid ?? null);
      setPartnerProfile(null);
      setStats((s) => ({ ...s, matchCount: s.matchCount + 1 }));
      // Partner profilini sunucudan çek + arkadaş mı kontrol et
      if (pid) {
        fetch(`/api/profile/${pid}`, { credentials: "include" })
          .then((r) => r.ok ? r.json() : null)
          .then((d: { profile: { displayName: string; age: number | null; gender: string | null; country: string | null; interests: string[]; photoUrl: string | null } } | null) => {
            if (d?.profile) setPartnerProfile(d.profile);
          })
          .catch(() => {});
        // Zaten arkadaşsa + butonunu devre dışı bırak
        fetch("/api/friends", { credentials: "include" })
          .then((r) => r.ok ? r.json() : null)
          .then((d: { friends: { userId: string; status: string }[] } | null) => {
            if (d?.friends?.some((f) => f.userId === pid && f.status === "accepted")) {
              setFriendRequested(true);
            }
          })
          .catch(() => {});
      }
      const stream = await getLocalStream();
      if (stream) {
        stream.getVideoTracks().forEach((t) => { t.enabled = !isVideoOff && document.visibilityState !== "hidden"; });
        createPeer(initiator, stream);
      }
    });

    socket.on("signal", ({ signal }: { signal: SimplePeer.SignalData }) => {
      if (peerRef.current && !peerRef.current.destroyed) {
        peerRef.current.signal(signal);
      } else {
        // Peer henüz oluşturulmadı — buffer'a al, createPeer drainleyecek
        pendingSignalsRef.current.push(signal);
      }
    });

    socket.on("partner-disconnected", () => {
      destroyPeer();
      setReportSent(false);
      setShowGiftPanel(false);
      setShowReportModal(false);
      setFriendRequested(false);
      setIncomingFriendReq(null);
      setMessages([]);
      setPartnerProfile(null);
      // Otomatik yeni arama — lobby'e atma
      setPartnerLeftMsg("Kullanıcı ayrıldı. Yeni eşleşme aranıyor...");
      setPhase("waiting");
      socketRef.current?.emit("find-match", { filters: filtersRef.current });
      setTimeout(() => setPartnerLeftMsg(null), 4000);
    });

    socket.on("chat-message", ({ text }: { text: string }) => {
      setMessages((prev) => [...prev, { id: Date.now().toString() + Math.random(), text, from: "stranger", timestamp: new Date() }]);
      // Stranger sent a message → no longer typing
      setPartnerTyping(false);
    });

    socket.on("partner-typing", ({ typing }: { typing: boolean }) => {
      setPartnerTyping(typing);
      if (partnerTypingTimerRef.current) clearTimeout(partnerTypingTimerRef.current);
      if (typing) {
        // Auto-clear typing after 4 s of silence (safety)
        partnerTypingTimerRef.current = setTimeout(() => setPartnerTyping(false), 4000);
      }
    });

    socket.on("partner-media-state", ({ audio, video }: { audio: boolean; video: boolean }) => {
      setPartnerAudioOn(audio);
      setPartnerVideoOn(video);
    });

    socket.on("partner-gift", ({ emoji, senderName }: { emoji: string; coins: number; senderName?: string }) => {
      giftOverlayRef.current?.push({
        emoji,
        senderName: senderName ?? partnerProfile?.displayName ?? "Birisi",
        side: "partner",
      });
    });

    socket.on("banned", () => {
      setIsBanned(true);
      setPhase("idle");
      destroyPeer();
    });

    // Fix 4: Yetersiz coin bildirimi
    socket.on("filter-insufficient-coins", ({ needed }: { needed: number }) => {
      setFilterCoinToast(`Yetersiz coin! Bu filtreler için ${needed} 🪙 gerekli.`);
      setTimeout(() => setFilterCoinToast(null), 5000);
    });

    // Fix 4: Giriş gerekli — bekleme ekranında takılmayı önle
    socket.on("auth-required", () => {
      setFilterCoinToast("Görüşme başlatmak için giriş yapman gerekiyor.");
      setPhase("idle");
      setTimeout(() => setFilterCoinToast(null), 5000);
    });

    socket.on("server-stats", ({ activeUsers }: { activeUsers: number }) => {
      setStats((s) => ({ ...s, activeUsers }));
    });

    // Anlık DM bildirimi
    socket.on("dm-received", ({ fromDisplayName, preview }: { fromDisplayName: string; preview: string }) => {
      if (phaseRef.current === "connected") return; // görüşmedeyken gösterme
      setDmToast({ fromDisplayName, preview });
      setTimeout(() => setDmToast(null), 5000);
    });

    // Admin duyurusu
    socket.on("announcement", ({ text }: { text: string }) => {
      setAnnounceToast(text);
      setTimeout(() => setAnnounceToast(null), 8000);
    });

    socket.on("partner-sent-friend-request", ({ fromName, fromUserId }: { fromName: string; fromUserId: string }) => {
      setIncomingFriendReq({ fromName, fromUserId });
    });

    socket.on("friend-accepted", () => {
      // Karşı taraf isteğimizi kabul etti — ✓ göster
      setFriendRequested(true);
    });

    socket.on("disconnect", (reason) => {
      if (reason !== "io client disconnect") setIsReconnecting(true);
    });
    socket.on("reconnect_attempt", () => setIsReconnecting(true));
    socket.on("reconnect", () => setIsReconnecting(false));
    socket.on("reconnect_failed", () => setIsReconnecting(false));
    socket.on("connect", () => {
      setIsReconnecting(false);
      // Fix 2: Sunucu yeniden başladıysa bekleme ekranındaki kullanıcıyı yeniden kuyruğa al
      if (phaseRef.current === "waiting") {
        socket.emit("find-match", { filters: filtersRef.current });
      }
    });

    return () => {
      destroyPeer();
      socket.disconnect();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      if (typingEmitTimerRef.current) { clearTimeout(typingEmitTimerRef.current); typingEmitTimerRef.current = null; }
      if (partnerTypingTimerRef.current) { clearTimeout(partnerTypingTimerRef.current); partnerTypingTimerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createPeer, destroyPeer, getLocalStream, authedUser?.id]);

  // ── Actions ──
  // Profil oluşturulunca çağrılır — needsProfile'ı sıfırlar
  const handleProfileSaved = useCallback((p: { displayName: string; photoUrl: string | null }) => {
    setNeedsProfile(false);
    setMyProfile(p);
  }, []);

  const startSearch = useCallback(async () => {
    if (isBanned) return;
    // Fix 1: Profil yoksa aramayı engelle
    if (needsProfile) return;
    const stream = await getLocalStream();
    if (!stream) return;
    setPhase("waiting");
    setMessages([]);
    setReportSent(false);
    socketRef.current?.emit("find-match", { filters });
  }, [filters, getLocalStream, isBanned, needsProfile]);

  const handleNext = () => {
    setMessages([]);
    setReportSent(false);
    setShowGiftPanel(false);
    setShowReportModal(false);
    destroyPeer();
    socketRef.current?.emit("next");
  };

  const handleStop = () => {
    destroyPeer();
    setPhase("idle");
    setReportSent(false);
    setShowGiftPanel(false);
    setShowReportModal(false);
    socketRef.current?.emit("next");
  };

  const handleBlock = () => {
    if (phase !== "connected") return;
    // Persist 24h ban via REST (server also persists via socket, but this guarantees
    // it even if socket happens to drop right after the click).
    if (partnerUserId) {
      fetch("/api/bans", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockedUserId: partnerUserId, durationHours: 24 }),
      }).catch(() => {});
    }
    socketRef.current?.emit("block");
    setMessages([]);
    setReportSent(false);
    setShowGiftPanel(false);
    setShowReportModal(false);
    setPartnerProfile(null);
    destroyPeer();
    setPhase("waiting");
    socketRef.current?.emit("find-match", { filters });
  };

  const openReportModal = () => {
    if (reportSent || phase !== "connected") return;
    setShowReportModal(true);
    setShowGiftPanel(false);
  };

  const submitReport = (reason: string) => {
    if (reportSent) return;
    setReportSent(true);
    setShowReportModal(false);
    socketRef.current?.emit("report", { reason });
    // Fix 10: Screenshot base64'ü DB'ye yazmıyoruz — notes alanına sadece kısa metin
    if (partnerUserId) {
      fetch("/api/reports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportedUserId: partnerUserId,
          reason,
        }),
      }).catch(() => {});
    }
    destroyPeer();
    setPhase("waiting");
    setMessages([]);
    socketRef.current?.emit("find-match", { filters });
  };

  const sendMessage = () => {
    const text = inputText.trim();
    if (!text || phase !== "connected") return;
    socketRef.current?.emit("chat-message", { text });
    setMessages((prev) => [...prev, { id: Date.now().toString() + Math.random(), text, from: "me", timestamp: new Date() }]);
    setInputText("");
    // Stop typing immediately after sending
    if (isTypingRef.current) {
      isTypingRef.current = false;
      socketRef.current?.emit("typing", { typing: false });
    }
    if (typingEmitTimerRef.current) { clearTimeout(typingEmitTimerRef.current); typingEmitTimerRef.current = null; }
    chatInputRef.current?.focus();
  };

  const handleInputChange = (val: string) => {
    setInputText(val);
    if (phase !== "connected") return;
    // Emit "typing: true" once, then debounce a "typing: false" after 1.5 s of silence
    if (val.trim() && !isTypingRef.current) {
      isTypingRef.current = true;
      socketRef.current?.emit("typing", { typing: true });
    }
    if (typingEmitTimerRef.current) clearTimeout(typingEmitTimerRef.current);
    typingEmitTimerRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        socketRef.current?.emit("typing", { typing: false });
      }
    }, 1500);
  };

  const toggleAudio = () => {
    if (!localStreamRef.current) return;
    const next = !isAudioMuted;
    localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setIsAudioMuted(next);
    socketRef.current?.emit("media-state", { audio: !next, video: !isVideoOff });
  };

  const toggleVideo = () => {
    if (!localStreamRef.current) return;
    const next = !isVideoOff;
    localStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = !next && document.visibilityState !== "hidden"; });
    setIsVideoOff(next);
    socketRef.current?.emit("media-state", { audio: !isAudioMuted, video: !next });
  };

  const handleSendGift = async (emoji: string, cost: number) => {
    if (phase !== "connected") return;
    if (coins < cost) {
      setCoinFlash(true);
      setTimeout(() => setCoinFlash(false), 800);
      return;
    }
    // Atomically spend on the server first
    try {
      const res = await fetch("/api/coins/spend", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: cost,
          giftEmoji: emoji,
          receiverId: partnerUserId ?? undefined,
        }),
      });
      if (!res.ok) {
        setCoinFlash(true);
        setTimeout(() => setCoinFlash(false), 800);
        return;
      }
      const data = (await res.json()) as { balance: number };
      setCoins(data.balance);
    } catch {
      setCoinFlash(true);
      setTimeout(() => setCoinFlash(false), 800);
      return;
    }
    // Bug 1 fix: socket.emit("gift") kaldırıldı — sunucu /api/coins/spend sonrası notifyUser() ile push eder
    giftOverlayRef.current?.push({
      emoji,
      senderName: myProfile?.displayName ?? "Sen",
      side: "me",
    });
  };

  // Auth yüklenirken spinner
  if (isLoading) {
    return (
      <div className="h-dvh w-full flex items-center justify-center bg-white">
        <div className="w-10 h-10 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  // Phase renders
  if (phase === "lobby") {
    return (
      <>
        <Landing
          onStartChat={startSearch}
          activeUsers={stats.activeUsers}
          startLoggedIn={!!authedUser}
          onLogin={onLogin}
          onLogout={onLogout}
          authedUser={authedUser}
          coins={coins}
          filters={filters}
          onFiltersChange={setFilters}
          forceProfileOpen={profileChecked && needsProfile}
          onProfileSaved={handleProfileSaved}
          isBroadcaster={isBroadcaster}
          onOpenBroadcasterDashboard={() => setShowBroadcasterDashboard(true)}
        />
        {announceToast && (
          <div className="fixed top-4 left-4 right-4 z-[200] bg-indigo-600 shadow-2xl rounded-2xl p-4 flex items-center gap-3 animate-slide-up">
            <span className="text-2xl flex-shrink-0">📢</span>
            <p className="text-sm font-semibold text-white flex-1">{announceToast}</p>
            <button onClick={() => setAnnounceToast(null)} className="text-indigo-200 hover:text-white text-xl flex-shrink-0">✕</button>
          </div>
        )}
        {showBroadcasterDashboard && <BroadcasterDashboard onClose={() => setShowBroadcasterDashboard(false)} />}
      </>
    );
  }
  if (phase === "idle") {
    return (
      <>
        <Landing
          onStartChat={startSearch}
          activeUsers={stats.activeUsers}
          startLoggedIn
          onLogin={onLogin}
          onLogout={onLogout}
          authedUser={authedUser}
          coins={coins}
          filters={filters}
          onFiltersChange={setFilters}
          forceProfileOpen={profileChecked && needsProfile}
          onProfileSaved={handleProfileSaved}
          isBroadcaster={isBroadcaster}
          onOpenBroadcasterDashboard={() => setShowBroadcasterDashboard(true)}
        />
        {announceToast && (
          <div className="fixed top-4 left-4 right-4 z-[200] bg-indigo-600 shadow-2xl rounded-2xl p-4 flex items-center gap-3 animate-slide-up">
            <span className="text-2xl flex-shrink-0">📢</span>
            <p className="text-sm font-semibold text-white flex-1">{announceToast}</p>
            <button onClick={() => setAnnounceToast(null)} className="text-indigo-200 hover:text-white text-xl flex-shrink-0">✕</button>
          </div>
        )}
        {showBroadcasterDashboard && <BroadcasterDashboard onClose={() => setShowBroadcasterDashboard(false)} />}
      </>
    );
  }
  if (phase === "waiting") {
    return <WaitingScreen onStop={handleStop} displayName={myProfile?.displayName} photoUrl={myProfile?.photoUrl} subtitle={partnerLeftMsg} />;
  }
  if (phase === "connecting") {
    return (
      <WaitingScreen
        onStop={handleStop}
        displayName={partnerProfile?.displayName}
        photoUrl={partnerProfile?.photoUrl}
        country={partnerProfile?.country}
        isConnecting
      />
    );
  }

  // ─────────────────────────────────────────────
  // Connected Video Chat UI
  // ─────────────────────────────────────────────
  return (
    <div className="h-dvh w-full flex flex-col bg-black">

      {/* ── TOP WHITE BAR ── */}
      <div className="bg-white flex items-center px-3 py-2.5 gap-2 flex-shrink-0 border-b border-gray-100 z-30 safe-top">
        {/* Back button */}
        <button
          onClick={handleStop}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 flex-shrink-0 active:bg-gray-200 transition-colors"
          aria-label="Geri"
        >
          <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Partner info */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-orange-400 flex-shrink-0 flex items-center justify-center border-2 border-gray-100 shadow-sm">
            {partnerProfile?.photoUrl
              ? <img src={partnerProfile.photoUrl} className="w-full h-full object-cover" alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              : <span className="text-white font-bold text-sm">{(partnerProfile?.displayName ?? "Y").charAt(0).toUpperCase()}</span>
            }
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900 truncate leading-tight">
              {partnerProfile?.displayName ?? "Yabancı"}
            </p>
            <p className="text-xs text-gray-500 flex items-center gap-1 leading-tight flex-wrap">
              {partnerProfile?.gender === "kadın" && <span>♀</span>}
              {partnerProfile?.gender === "erkek" && <span>♂</span>}
              {partnerProfile?.age && <span>{partnerProfile.age}</span>}
              {partnerProfile?.country && <span className="flex items-center gap-0.5">📍 {partnerProfile.country}</span>}
            </p>
          </div>
        </div>

        {/* Friend request (+) button */}
        <button
          onClick={async () => {
            if (!partnerUserId || friendRequested) return;
            setFriendRequested(true);
            socketRef.current?.emit("send-friend-request");
            await fetch("/api/friends", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ peerId: partnerUserId }),
            }).catch(() => {});
          }}
          disabled={!partnerUserId || friendRequested}
          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xl transition-colors active:scale-95 ${friendRequested ? "bg-gray-300 text-gray-500" : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-200"}`}
          aria-label="Arkadaş ekle"
        >
          {friendRequested ? "✓" : "+"}
        </button>

        {/* Microphone button */}
        <button
          onClick={toggleAudio}
          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors active:scale-95 ${isAudioMuted ? "bg-red-100 text-red-500" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          aria-label="Mikrofon"
        >
          {isAudioMuted ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l4-4m0 4l-4-4" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 11-14 0M12 18.5v3m-3.5 0h7M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z" />
            </svg>
          )}
        </button>

        {/* Shield / Report button */}
        <button
          onClick={openReportModal}
          disabled={reportSent}
          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors active:scale-95 ${reportSent ? "bg-gray-100 text-gray-300" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
          aria-label="Şikayet"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </button>
      </div>

      {/* ── VIDEO AREA ── */}
      <div className="flex-1 relative overflow-hidden bg-black">
        {/* Remote video full-screen */}
        <video
          key={remoteVideoKey}
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${partnerVideoOn ? "opacity-100" : "opacity-20"}`}
        />

        {/* Blurred background layer */}
        <video
          ref={remoteBgVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover -z-10"
          style={{ filter: "blur(24px) brightness(0.35)", transform: "scale(1.1)" }}
        />

        {/* Partner camera off */}
        {!partnerVideoOn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-10">
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-3">
              <svg className="w-10 h-10 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M12 18.75H4.5a2.25 2.25 0 01-2.25-2.25V9m12.841 9.091L16.5 19.5m-1.409-1.409c.407-.407.659-.97.659-1.591v-9a2.25 2.25 0 00-2.25-2.25h-9c-.621 0-1.184.252-1.591.659m12.182 12.182L2.909 5.909M1.5 4.5l1.409 1.409" />
              </svg>
            </div>
            <p className="text-white/50 text-sm">Kamera kapalı</p>
          </div>
        )}

        {/* WebRTC reconnecting overlay */}
        {webrtcReconnecting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-30 backdrop-blur-sm">
            <div className="w-14 h-14 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4" />
            <p className="text-white font-bold text-lg">Bağlantı koptu</p>
            <p className="text-white/60 text-sm mt-1">Yeni eşleşme aranıyor…</p>
          </div>
        )}

        {/* Timer — top left */}
        <div className="absolute top-3 left-3 z-20">
          <span className="text-white text-sm font-mono font-semibold bg-black/45 backdrop-blur-sm px-2.5 py-1 rounded-full shadow">
            {formatTimer(callSeconds)}
          </span>
        </div>

        {/* PiP — own camera, top right */}
        <div className="absolute top-3 right-2 w-[88px] aspect-[9/16] rounded-2xl overflow-hidden border-2 border-white/50 shadow-2xl z-20 bg-black">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transition-opacity duration-300 ${isVideoOff || tabHidden ? "opacity-0" : "opacity-100"}`}
          />
          {(isVideoOff || tabHidden) && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
              <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
          )}
        </div>

        {/* Network / reconnect toasts */}
        {isReconnecting && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-yellow-400 text-black text-xs font-bold px-3 py-1.5 rounded-full z-30 whitespace-nowrap shadow">
            <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
            Bağlanıyor...
          </div>
        )}
        {networkPoor && !isReconnecting && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/60 text-amber-300 text-xs font-medium px-2.5 py-1 rounded-full z-20 whitespace-nowrap">
            ⚠️ Zayıf Bağlantı
          </div>
        )}
        {filterCoinToast && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-xs font-semibold px-4 py-2 rounded-full z-30 whitespace-nowrap animate-fade-in">
            ⚠️ {filterCoinToast}
          </div>
        )}
        {!partnerAudioOn && (
          <div className="absolute top-14 left-3 flex items-center gap-1 bg-red-500/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full z-20">
            🔇 Mikrofonu kapalı
          </div>
        )}
        {mediaError && (
          <div className="absolute top-14 left-3 right-3 bg-red-900/90 text-red-200 text-xs p-3 rounded-xl z-30">
            {mediaError}
          </div>
        )}

        {/* Incoming friend request overlay — left of PiP */}
        {incomingFriendReq && (
          <div className="absolute top-3 right-[100px] z-30 flex flex-col items-end gap-1.5 animate-fade-in">
            <p className="text-white text-xs font-semibold drop-shadow-lg bg-black/40 backdrop-blur-sm px-2.5 py-1.5 rounded-xl max-w-[160px] text-center leading-snug">
              {incomingFriendReq.fromName} sana bir arkadaşlık isteği gönderdi
            </p>
            <button
              onClick={async () => {
                if (!incomingFriendReq.fromUserId) return;
                await fetch(`/api/friends/${incomingFriendReq.fromUserId}/accept`, {
                  method: "POST",
                  credentials: "include",
                }).catch(() => {});
                setIncomingFriendReq(null);
              }}
              className="bg-emerald-500 text-white text-sm font-bold px-4 py-1.5 rounded-xl shadow-lg active:scale-95 transition-transform"
            >
              Kabul et
            </button>
          </div>
        )}

        {/* Chat messages — left side */}
        <div className="absolute left-3 bottom-4 max-h-52 overflow-hidden flex flex-col justify-end gap-1 z-20 max-w-[62%]">
          {messages.slice(-7).map((msg) => (
            <div key={msg.id} className="animate-slide-up">
              <span
                className={`text-sm font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${msg.from === "me" ? "text-emerald-300" : "text-white"}`}
                style={{ textShadow: "0 1px 4px rgba(0,0,0,0.85)" }}
              >
                {msg.text}
              </span>
            </div>
          ))}
          {partnerTyping && (
            <div className="flex items-center gap-1 animate-fade-in">
              <span className="flex gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-white/80" style={{ animation: "typingDot 1.2s ease-in-out infinite" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-white/80" style={{ animation: "typingDot 1.2s ease-in-out 0.2s infinite" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-white/80" style={{ animation: "typingDot 1.2s ease-in-out 0.4s infinite" }} />
              </span>
              <span className="text-white/70 text-xs" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.85)" }}>yazıyor...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Premium gift overlay (combo, rarity, cinematic effects) */}
        <GiftOverlay ref={giftOverlayRef} />
      </div>

      {/* ── BOTTOM BAR ── */}
      <div className="bg-black/95 px-4 py-3 flex items-center gap-3 flex-shrink-0 safe-bottom">
        {/* Google Translate icon */}
        <button
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 hover:bg-white/20 transition-colors active:scale-95"
          aria-label="Çeviri"
        >
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
          </svg>
        </button>

        {/* Message input */}
        <div className="flex-1 flex items-center bg-white/10 rounded-full border border-white/15 overflow-hidden">
          <input
            ref={chatInputRef}
            type="text"
            value={inputText}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Mesaj yaz..."
            maxLength={500}
            className="flex-1 bg-transparent text-white text-sm px-4 py-2.5 placeholder-white/35 focus:outline-none min-w-0"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
          />
        </div>

        {/* Send button */}
        <button
          onClick={sendMessage}
          disabled={!inputText.trim()}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 disabled:opacity-30 hover:bg-white/20 transition-colors active:scale-95"
          aria-label="Gönder"
        >
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>

        {/* Gift button */}
        <button
          onClick={() => { setShowGiftPanel((p) => !p); setShowReportModal(false); }}
          className="w-10 h-10 rounded-full bg-pink-500/90 flex items-center justify-center flex-shrink-0 shadow-lg hover:bg-pink-500 transition-colors active:scale-95"
          aria-label="Hediye"
        >
          <Twemoji emoji="🎁" size={22} />
        </button>
      </div>

      {/* GIFT PANEL */}
      {showGiftPanel && (
        <>
          <div className="absolute inset-0 z-40" onClick={() => setShowGiftPanel(false)} />
          <div className="absolute bottom-16 right-2 w-72 max-w-[calc(100vw-1rem)] z-50 bg-black/95 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-4">
              <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                {GIFTS.map((g, i) => {
                  const affordable = coins >= g.coins;
                  return (
                    <button
                      key={i}
                      onClick={() => { handleSendGift(g.emoji, g.coins); setShowGiftPanel(false); }}
                      className={`flex flex-col items-center gap-1 rounded-xl p-2 transition-all active:scale-90 ${affordable ? "hover:bg-white/10" : "opacity-50"}`}
                    >
                      <Twemoji emoji={g.emoji} size={28} />
                      <div className="flex items-center gap-0.5">
                        <Twemoji emoji="🪙" size={9} />
                        <span className="text-yellow-300 text-[10px] font-semibold">{g.coins}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 bg-black/60">
              <div className="flex items-center gap-1.5">
                <Twemoji emoji="🪙" size={16} />
                <span className={`font-bold text-sm tabular-nums ${coinFlash ? "text-red-400" : "text-white"}`}>{coins}</span>
              </div>
              <button
                onClick={() => { setShowBuyCoins(true); setShowGiftPanel(false); }}
                className="bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-full active:scale-95 hover:bg-emerald-400 transition-colors"
              >
                Şimdi satın al →
              </button>
            </div>
          </div>
        </>
      )}

      {/* DM TOAST */}
      {dmToast && (
        <div className="fixed bottom-20 left-4 right-4 z-[100] bg-white shadow-2xl rounded-2xl p-4 flex items-center gap-3 border border-gray-100 animate-slide-up">
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold flex-shrink-0">
            {dmToast.fromDisplayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900 truncate">💬 {dmToast.fromDisplayName}</p>
            <p className="text-xs text-gray-500 truncate">{dmToast.preview}</p>
          </div>
          <button onClick={() => setDmToast(null)} className="text-gray-300 hover:text-gray-600 text-xl flex-shrink-0">✕</button>
        </div>
      )}

      {/* ANNOUNCEMENT TOAST */}
      {announceToast && (
        <div className="fixed top-4 left-4 right-4 z-[110] bg-indigo-600 shadow-2xl rounded-2xl p-4 flex items-center gap-3 animate-slide-up">
          <span className="text-2xl flex-shrink-0">📢</span>
          <p className="text-sm font-semibold text-white flex-1">{announceToast}</p>
          <button onClick={() => setAnnounceToast(null)} className="text-indigo-200 hover:text-white text-xl flex-shrink-0">✕</button>
        </div>
      )}

      {/* BUY COINS MODAL (in-call) */}
      {showBuyCoins && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-[70] p-4 animate-fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <h2 className="font-black text-gray-900 text-lg">🪙 Coin Satın Al</h2>
                <p className="text-xs text-gray-500 mt-0.5">Mevcut: <strong>{coins}</strong> coin</p>
              </div>
              <button onClick={() => setShowBuyCoins(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold hover:bg-gray-200">✕</button>
            </div>
            <div className="px-4 pb-5 grid grid-cols-2 gap-2">
              {([
                { id: "pkg_450",   coins: 450,   price: 129  },
                { id: "pkg_1800",  coins: 1800,  price: 479  },
                { id: "pkg_3500",  coins: 3500,  price: 883  },
                { id: "pkg_7000",  coins: 7000,  price: 1675 },
                { id: "pkg_15000", coins: 15000, price: 3528 },
                { id: "pkg_35000", coins: 35000, price: 8048 },
              ] as const).map((pkg) => (
                <button
                  key={pkg.id}
                  disabled={buyCoinsLoading !== null}
                  onClick={async () => {
                    setBuyCoinsLoading(pkg.id);
                    try {
                      const res = await fetch("/api/checkout/session", {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ packageId: pkg.id }),
                      });
                      if (res.ok) {
                        const d = await res.json() as { url?: string };
                        if (d.url) window.open(d.url, "_blank");
                      }
                    } catch { /* ignore */ }
                    setBuyCoinsLoading(null);
                    setShowBuyCoins(false);
                  }}
                  className="flex flex-col items-center gap-1 py-3 px-2 rounded-2xl border-2 border-gray-100 hover:border-emerald-400 hover:bg-emerald-50 transition-all active:scale-95 disabled:opacity-50"
                >
                  <span className="text-yellow-500 font-black text-lg">{pkg.coins.toLocaleString()}</span>
                  <span className="text-xs text-gray-400">coin</span>
                  <span className="text-emerald-600 font-bold text-sm mt-1">₺{pkg.price}</span>
                  {buyCoinsLoading === pkg.id && <span className="text-[10px] text-gray-400 animate-pulse">İşleniyor…</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* REPORT MODAL */}
      {showReportModal && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-2xl overflow-hidden animate-fade-in-scale">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <p className="text-sm font-bold text-gray-800">Şikayet Et</p>
              <button onClick={() => setShowReportModal(false)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 text-2xl font-light">×</button>
            </div>
            <div className="pb-4">
              {REPORT_REASONS.map((reason, i) => (
                <button
                  key={reason}
                  onClick={() => submitReport(reason)}
                  className={`w-full text-left px-5 py-3.5 text-gray-800 hover:bg-gray-50 text-sm font-medium ${i < REPORT_REASONS.length - 1 ? "border-b border-gray-100" : ""}`}
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
