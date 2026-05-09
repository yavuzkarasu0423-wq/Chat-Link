import { db } from "@workspace/db";
import { subscriptionsTable, isVipActive, type VipPlan, type Subscription } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export interface VipStatus {
  active: boolean;
  plan: VipPlan | null;
  currentPeriodEnd: Date | null;
}

/** Returns the user's VIP status. Cached intentionally NOT — querying is cheap and accurate. */
export async function getVipStatus(userId: string): Promise<VipStatus> {
  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId))
    .limit(1);
  const active = isVipActive(sub);
  return {
    active,
    plan: active ? (sub?.plan as VipPlan) : null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
  };
}

export function vipCanWaiveFilterCost(plan: VipPlan | null, kind: "gender" | "country"): boolean {
  if (!plan) return false;
  if (kind === "gender") return plan === "bronze" || plan === "silver" || plan === "gold";
  if (kind === "country") return plan === "silver" || plan === "gold";
  return false;
}

export function vipCanInvisible(plan: VipPlan | null): boolean {
  return plan === "silver" || plan === "gold";
}

export function vipMatchPriority(plan: VipPlan | null): number {
  if (plan === "gold") return 3;
  if (plan === "silver") return 2;
  if (plan === "bronze") return 1;
  return 0;
}

export function vipBadge(plan: VipPlan | null): string | null {
  if (plan === "gold") return "🥇";
  if (plan === "silver") return "🥈";
  if (plan === "bronze") return "🥉";
  return null;
}

export type { Subscription };
