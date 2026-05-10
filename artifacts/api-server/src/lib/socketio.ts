import { Server as SocketIOServer, type Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import { db } from "@workspace/db";
import {
  userBansTable,
  coinBalancesTable,
  coinTransactionsTable,
  userReportsTable,
  dmMessagesTable,
  matchHistoryTable,
  profilesTable,
} from "@workspace/db/schema";
import { eq, and, or, sql } from "drizzle-orm";
import { logger } from "./logger";
import { getVipStatus, vipCanWaiveFilterCost } from "./vip";

interface SocketData {
  userId?: string;
  displayName?: string;
  gender?: string;
  country?: string;
  profileLoaded?: boolean; // Bug 4 fix: async yüklenme takibi
}

interface QueueEntry {
  socketId: string;
  userId?: string;
  filters: { gender?: string; country?: string | null };
  gender?: string;
  country?: string;
}

interface RoomData {
  a: string;
  b: string;
  userA?: string;
  userB?: string;
  startedAt: Date;
}

const queue: QueueEntry[] = [];
const rooms = new Map<string, RoomData>();

// userId → socketId map for DM push notifications
const userSockets = new Map<string, string>();
let _io: SocketIOServer | null = null;

/** Push a real-time event to a specific user's socket (if connected). */
export function notifyUser(userId: string, event: string, data: unknown) {
  if (!_io) return;
  const socketId = userSockets.get(userId);
  if (socketId) _io.to(socketId).emit(event, data);
}

/** Returns all currently connected user IDs (for admin live view). */
export function getLiveUserIds(): string[] {
  return Array.from(userSockets.keys());
}

/** Broadcasts an announcement to every connected socket. */
export function broadcastAnnouncement(text: string): void {
  if (!_io) return;
  _io.emit("announcement", { text, at: Date.now() });
}

function removeFromQueue(socketId: string) {
  const idx = queue.findIndex((e) => e.socketId === socketId);
  if (idx !== -1) queue.splice(idx, 1);
}

function getRoomForSocket(socketId: string) {
  for (const [roomId, room] of rooms.entries()) {
    if (room.a === socketId || room.b === socketId) return { roomId, room };
  }
  return null;
}

function getPartnerSocketId(room: RoomData, mySocketId: string) {
  return room.a === mySocketId ? room.b : room.a;
}

async function recordMatch(room: RoomData) {
  if (!room.userA || !room.userB) return;
  const endedAt = new Date();
  const durationSeconds = Math.floor((endedAt.getTime() - room.startedAt.getTime()) / 1000);
  if (durationSeconds < 3) return;
  try {
    await db.insert(matchHistoryTable).values({
      userAId: room.userA,
      userBId: room.userB,
      endedAt,
      durationSeconds,
    });
  } catch { /* non-fatal */ }
}

async function isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const row = await db
    .select({ id: userBansTable.id })
    .from(userBansTable)
    .where(
      and(
        eq(userBansTable.blockerId, blockerId),
        eq(userBansTable.blockedId, blockedId),
        or(
          sql`${userBansTable.expiresAt} IS NULL`,
          sql`${userBansTable.expiresAt} > NOW()`,
        ),
      ),
    )
    .limit(1);
  return row.length > 0;
}

/** Filtre coin maliyeti hesapla ve kes. VIP planları muafiyet sağlar. Yetersiz bakiye → false döner. */
async function deductFilterCoins(
  userId: string,
  genderFilter?: string,
  countryFilter?: string | null,
): Promise<{ ok: boolean; cost: number }> {
  const vip = await getVipStatus(userId);
  let cost = 0;
  if (genderFilter === "female" && !vipCanWaiveFilterCost(vip.plan, "gender")) cost += 20;
  if (countryFilter && !vipCanWaiveFilterCost(vip.plan, "country")) cost += 10;
  if (cost === 0) return { ok: true, cost: 0 };

  const updated = await db
    .update(coinBalancesTable)
    .set({ balance: sql`${coinBalancesTable.balance} - ${cost}` })
    .where(
      and(
        eq(coinBalancesTable.userId, userId),
        sql`${coinBalancesTable.balance} >= ${cost}`,
      ),
    )
    .returning({ balance: coinBalancesTable.balance });

  if (updated.length === 0) return { ok: false, cost };

  await db.insert(coinTransactionsTable).values({
    userId,
    amount: -cost,
    reason: "Eşleşme filtresi",
  }).catch(() => {});

  return { ok: true, cost };
}

export function setupSocketIO(server: HttpServer) {
  const io = new SocketIOServer(server, {
    cors: { origin: "*", credentials: true },
    path: "/socket.io",
  });
  _io = io;

  const getActiveUsers = () => io.engine.clientsCount;

  const broadcastStats = () => {
    io.emit("server-stats", { activeUsers: getActiveUsers() });
  };

  io.on("connection", (socket: Socket) => {
    const userId = socket.handshake.auth["userId"] as string | undefined;
    const socketData: SocketData = { userId };
    if (userId) {
      userSockets.set(userId, socket.id);
      // Profil bilgilerini yükle (cinsiyet/ülke filtre eşleşmesi için)
      db.select()
        .from(profilesTable)
        .where(eq(profilesTable.userId, userId))
        .limit(1)
        .then(([profile]) => {
          if (profile) {
            socketData.gender = profile.gender ?? undefined;
            socketData.country = profile.country ?? undefined;
            socketData.displayName = profile.displayName;
          }
          socketData.profileLoaded = true; // Bug 4 fix
        })
        .catch(() => { socketData.profileLoaded = true; });
    }
    logger.info({ socketId: socket.id, userId }, "Socket connected");
    broadcastStats();

    socket.emit("server-stats", { activeUsers: getActiveUsers() });

    socket.on("find-match", async ({ filters }: { filters?: { gender?: string; country?: string | null } }) => {
      // Giriş yapmamış kullanıcılar eşleşme kuyruğuna giremez
      if (!socketData.userId) {
        socket.emit("auth-required");
        return;
      }

      removeFromQueue(socket.id);

      // Bug 4 fix: Profil verisi henüz yüklenmediyse senkron olarak çek
      // (socket yeni bağlandıysa ve kullanıcı hemen find-match gönderirse)
      if (!socketData.profileLoaded) {
        try {
          const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, socketData.userId)).limit(1);
          if (profile) {
            socketData.gender = profile.gender ?? undefined;
            socketData.country = profile.country ?? undefined;
            socketData.displayName = profile.displayName;
          }
          socketData.profileLoaded = true;
        } catch { socketData.profileLoaded = true; }
      }

      // Filtre coin maliyeti (sadece giriş yapan kullanıcılara uygulanır)
      if (socketData.userId) {
        const { ok, cost } = await deductFilterCoins(
          socketData.userId,
          filters?.gender,
          filters?.country,
        );
        if (!ok) {
          socket.emit("filter-insufficient-coins", { needed: cost });
          // Yetersiz coin → filtresiz kuyruğa ekle
          filters = {};
        }
      }

      const entry: QueueEntry = {
        socketId: socket.id,
        userId: socketData.userId,
        filters: filters ?? {},
        gender: socketData.gender,
        country: socketData.country,
      };

      let matchIdx = -1;
      for (let i = 0; i < queue.length; i++) {
        const candidate = queue[i];
        if (candidate.socketId === socket.id) continue;

        const wantedGender = filters?.gender;
        // Bug 5 fix: profili olmayan (null cinsiyet) adaylar cinsiyet filtresinden muaf tutulmaz
        if (wantedGender && wantedGender !== "any" && (!candidate.gender || candidate.gender !== wantedGender)) continue;
        const candidateWantsGender = candidate.filters?.gender;
        if (candidateWantsGender && candidateWantsGender !== "any" && (!socketData.gender || socketData.gender !== candidateWantsGender)) continue;

        const wantedCountry = filters?.country;
        // Bug 5 fix: profili olmayan (null ülke) adaylar ülke filtresinden muaf tutulmaz
        if (wantedCountry && (!candidate.country || candidate.country !== wantedCountry)) continue;
        const candidateWantsCountry = candidate.filters?.country;
        if (candidateWantsCountry && (!socketData.country || socketData.country !== candidateWantsCountry)) continue;

        if (entry.userId && candidate.userId) {
          const [ab, ba] = await Promise.all([
            isBlocked(entry.userId, candidate.userId),
            isBlocked(candidate.userId, entry.userId),
          ]);
          if (ab || ba) continue;
        }

        matchIdx = i;
        break;
      }

      if (matchIdx !== -1) {
        const partner = queue.splice(matchIdx, 1)[0];
        const roomId = `room-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const roomData: RoomData = {
          a: socket.id,
          b: partner.socketId,
          userA: entry.userId,
          userB: partner.userId,
          startedAt: new Date(),
        };
        rooms.set(roomId, roomData);
        socket.join(roomId);
        const partnerSocket = io.sockets.sockets.get(partner.socketId);
        partnerSocket?.join(roomId);

        socket.emit("matched", { roomId, initiator: true, partnerUserId: partner.userId });
        partnerSocket?.emit("matched", { roomId, initiator: false, partnerUserId: entry.userId });
      } else {
        queue.push(entry);
        socket.emit("waiting");
      }
    });

    socket.on("signal", ({ signal }: { signal: unknown }) => {
      const match = getRoomForSocket(socket.id);
      if (!match) return;
      const partnerSocketId = getPartnerSocketId(match.room, socket.id);
      io.to(partnerSocketId).emit("signal", { signal });
    });

    socket.on("chat-message", ({ text }: { text: string }) => {
      // Fix 9: Mesaj boyutunu sunucuda doğrula
      if (!text || typeof text !== "string" || text.trim().length === 0 || text.length > 2000) return;
      const match = getRoomForSocket(socket.id);
      if (!match) return;
      const partnerSocketId = getPartnerSocketId(match.room, socket.id);
      io.to(partnerSocketId).emit("chat-message", { text, from: "partner" });
    });

    socket.on("typing", ({ typing }: { typing: boolean }) => {
      const match = getRoomForSocket(socket.id);
      if (!match) return;
      const partnerSocketId = getPartnerSocketId(match.room, socket.id);
      io.to(partnerSocketId).emit("partner-typing", { typing });
    });

    socket.on("media-state", ({ audio, video }: { audio: boolean; video: boolean }) => {
      const match = getRoomForSocket(socket.id);
      if (!match) return;
      const partnerSocketId = getPartnerSocketId(match.room, socket.id);
      io.to(partnerSocketId).emit("partner-media-state", { audio, video });
    });

    // Bug 1 fix: "gift" socket eventi kaldırıldı — sunucu artık hediye bildirimi için
    // istemciye güvenmez; /api/coins/spend REST çağrısı başarılı olunca notifyUser() ile push eder

    socket.on("next", () => {
      const match = getRoomForSocket(socket.id);
      if (match) {
        const partnerSocketId = getPartnerSocketId(match.room, socket.id);
        io.to(partnerSocketId).emit("partner-disconnected");
        void recordMatch(match.room);
        rooms.delete(match.roomId);
      }
      removeFromQueue(socket.id);
    });

    socket.on("block", async () => {
      const match = getRoomForSocket(socket.id);
      if (!match) return;
      const partnerSocketId = getPartnerSocketId(match.room, socket.id);
      const partnerUserId = match.room.a === socket.id ? match.room.userB : match.room.userA;

      if (socketData.userId && partnerUserId) {
        await db.insert(userBansTable).values({
          blockerId: socketData.userId,
          blockedId: partnerUserId,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }).onConflictDoNothing();
      }

      io.to(partnerSocketId).emit("partner-disconnected");
      void recordMatch(match.room);
      rooms.delete(match.roomId);
    });

    socket.on("send-friend-request", () => {
      const match = getRoomForSocket(socket.id);
      if (!match) return;
      const partnerSocketId = getPartnerSocketId(match.room, socket.id);
      io.to(partnerSocketId).emit("partner-sent-friend-request", {
        fromName: socketData.displayName ?? "Biri",
        fromUserId: socketData.userId,
      });
    });

    socket.on("report", async ({ reason }: { reason: string }) => {
      const match = getRoomForSocket(socket.id);
      if (!match) return;
      const partnerUserId = match.room.a === socket.id ? match.room.userB : match.room.userA;
      if (socketData.userId && partnerUserId) {
        await db.insert(userReportsTable).values({
          reporterId: socketData.userId,
          reportedId: partnerUserId,
          reason,
        }).catch(() => {});
      }
    });

    socket.on("disconnect", () => {
      if (userId) userSockets.delete(userId);
      const match = getRoomForSocket(socket.id);
      if (match) {
        const partnerSocketId = getPartnerSocketId(match.room, socket.id);
        io.to(partnerSocketId).emit("partner-disconnected");
        void recordMatch(match.room);
        rooms.delete(match.roomId);
      }
      removeFromQueue(socket.id);
      logger.info({ socketId: socket.id }, "Socket disconnected");
      broadcastStats();
    });
  });

  return io;
}
