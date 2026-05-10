import { db } from "@workspace/db";
import { pushTokensTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
  sound?: "default" | null;
  channelId?: string;
}

interface ExpoMessage extends PushPayload {
  to: string;
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoResponse {
  data?: ExpoTicket[];
  errors?: { code: string; message: string }[];
}

function isExpoToken(token: string): boolean {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

async function sendBatch(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
  if (messages.length === 0) return [];
  const accessToken = process.env["EXPO_ACCESS_TOKEN"];
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
  };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(messages),
    });
    const json = (await res.json()) as ExpoResponse;
    return json.data ?? [];
  } catch (err) {
    logger.warn({ err }, "Expo push request failed");
    return [];
  }
}

/**
 * Send a push notification to all of the user's registered devices.
 * Silently no-ops when the user has no tokens. Auto-prunes invalid tokens.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    const rows = await db
      .select({ token: pushTokensTable.token })
      .from(pushTokensTable)
      .where(eq(pushTokensTable.userId, userId));
    if (rows.length === 0) return;

    const messages: ExpoMessage[] = rows
      .filter((r) => isExpoToken(r.token))
      .map((r) => ({
        to: r.token,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        sound: payload.sound === undefined ? "default" : payload.sound,
        ...(payload.badge !== undefined ? { badge: payload.badge } : {}),
        ...(payload.channelId ? { channelId: payload.channelId } : {}),
      }));

    if (messages.length === 0) return;

    const tickets = await sendBatch(messages);
    const invalidTokens: string[] = [];
    tickets.forEach((t, i) => {
      if (t.status === "error") {
        const err = t.details?.error;
        const msg = messages[i];
        if (err === "DeviceNotRegistered" && msg) {
          invalidTokens.push(msg.to);
        }
      }
    });
    if (invalidTokens.length > 0) {
      await db.delete(pushTokensTable).where(inArray(pushTokensTable.token, invalidTokens));
    }
  } catch (err) {
    logger.warn({ err, userId }, "sendPushToUser failed");
  }
}
