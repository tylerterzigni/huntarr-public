import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { recommendationCache } from "@/lib/db/schema";
import type { RecommendationItem } from "@/types";

export type ForYouCachePayload = {
  items: RecommendationItem[];
};

export async function getForYouDbCache(
  userId: string,
  cacheKey: string
): Promise<{ payload: ForYouCachePayload; expiresAt: number } | null> {
  const [row] = await db
    .select()
    .from(recommendationCache)
    .where(and(eq(recommendationCache.userId, userId), eq(recommendationCache.cacheKey, cacheKey)))
    .limit(1);

  if (!row) return null;

  const payload = row.data as ForYouCachePayload;
  if (!payload?.items) return null;

  return {
    payload,
    expiresAt: row.expiresAt.getTime(),
  };
}

export async function setForYouDbCache(
  userId: string,
  cacheKey: string,
  payload: ForYouCachePayload,
  ttlMs: number
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs);

  await db
    .delete(recommendationCache)
    .where(and(eq(recommendationCache.userId, userId), eq(recommendationCache.cacheKey, cacheKey)));

  await db.insert(recommendationCache).values({
    userId,
    cacheKey,
    data: payload,
    expiresAt,
  });
}

export async function deleteForYouDbCacheEntry(
  userId: string,
  cacheKey: string
): Promise<void> {
  await db
    .delete(recommendationCache)
    .where(and(eq(recommendationCache.userId, userId), eq(recommendationCache.cacheKey, cacheKey)));
}

export async function clearForYouDbCache(userId?: string): Promise<void> {
  if (userId) {
    await db.delete(recommendationCache).where(eq(recommendationCache.userId, userId));
    return;
  }
  await db.delete(recommendationCache);
}
