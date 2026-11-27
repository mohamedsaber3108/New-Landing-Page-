// Sign-in lockout (L-A1a round 2, review-015 findings 2 and 4).
//
// Two layers, so an attacker cannot keep a known admin locked out:
//  1. Per account + IP: 5 failed sign-ins from one IP for one account lock
//     THAT pair for 15 min. The real admin on another IP can still sign in.
//     Kept in process memory with the PR #7 limiter (same single-process
//     shortcut as the rate limits; a restart clears it).
//  2. Account-wide backstop in D1: one atomic UPDATE adds 1 to failed_count
//     and, in the same statement, sets locked_until when the count reaches
//     ACCOUNT_LOCK_THRESHOLD (50). With the per-IP sign-in limit (10 per
//     15 min) that needs at least 5 IPs, so a slow distributed guess is
//     stopped without letting one IP lock the owner out.
// Every locked answer looks exactly like a wrong passphrase (401, same body),
// and the passphrase check still runs, so nothing reveals the lock or the
// account.

import { eq, sql } from "drizzle-orm";
import { staffUsers } from "@/db/schema";
import type { Db } from "./idempotency";
import { limitKey } from "./rate-limit";

export const PAIR_FAILURE_LIMIT = 5;
export const PAIR_LOCK_MS = 15 * 60_000;
export const ACCOUNT_LOCK_THRESHOLD = 50;
export const ACCOUNT_LOCK_MS = 15 * 60_000;

/** Key for the account + IP pair. Uses the user id, never the email text. */
function pairKey(userId: number, ip: string | null): string {
  return `${userId}|${ip ?? "unknown"}`;
}

/** True when this account + IP pair is locked. Does not count. */
export function pairLocked(request: Request, userId: number, ip: string | null): boolean {
  return limitKey(request, "staffLoginPair", pairKey(userId, ip), "-", { count: false }) !== null;
}

/** Count one failed sign-in for the pair (the 5th starts a 15 min lock). */
export function recordPairFailure(request: Request, userId: number, ip: string | null): void {
  limitKey(request, "staffLoginPair", pairKey(userId, ip), "-");
}

/** True when the account-wide backstop lock is active. */
export function accountLocked(lockedUntil: string | null | undefined, now: number): boolean {
  return Boolean(lockedUntil) && Date.parse(lockedUntil as string) > now;
}

/**
 * One atomic statement: failed_count + 1, and the lock when the threshold is
 * reached (SQLite evaluates every SET expression on the OLD row values).
 */
export async function recordAccountFailure(db: Db, userId: number, now: number): Promise<void> {
  const lockIso = new Date(now + ACCOUNT_LOCK_MS).toISOString();
  await db
    .update(staffUsers)
    .set({
      failedCount: sql`CASE WHEN ${staffUsers.failedCount} + 1 >= ${ACCOUNT_LOCK_THRESHOLD} THEN 0 ELSE ${staffUsers.failedCount} + 1 END`,
      lockedUntil: sql`CASE WHEN ${staffUsers.failedCount} + 1 >= ${ACCOUNT_LOCK_THRESHOLD} THEN ${lockIso} ELSE ${staffUsers.lockedUntil} END`,
    })
    .where(eq(staffUsers.id, userId));
}

/** After a good sign-in. */
export async function clearAccountFailures(db: Db, userId: number): Promise<void> {
  await db.update(staffUsers).set({ failedCount: 0, lockedUntil: null }).where(eq(staffUsers.id, userId));
}
