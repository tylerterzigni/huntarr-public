import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { likedListItems } from "@/lib/db/schema";
import type { LikedKind } from "@/lib/db/schema";
import type { MediaType } from "@/types";

export type { LikedKind };

export async function listLikedItems(userId: string) {
  return db
    .select()
    .from(likedListItems)
    .where(eq(likedListItems.userId, userId))
    .orderBy(likedListItems.createdAt);
}

export async function listLikedMedia(userId: string) {
  const items = await listLikedItems(userId);
  return items.filter((item) => item.kind === "movie" || item.kind === "tv");
}

export async function listLikedPeople(userId: string) {
  const items = await listLikedItems(userId);
  return items.filter((item) => item.kind === "person");
}

export async function likedEntryExists(params: {
  userId: string;
  tmdbId: number;
  kind: LikedKind;
}): Promise<boolean> {
  const rows = await db
    .select()
    .from(likedListItems)
    .where(
      and(
        eq(likedListItems.userId, params.userId),
        eq(likedListItems.tmdbId, params.tmdbId),
        eq(likedListItems.kind, params.kind)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function addToLikedList(params: {
  userId: string;
  tmdbId: number;
  kind: LikedKind;
  title: string;
}) {
  return db
    .insert(likedListItems)
    .values({
      userId: params.userId,
      tmdbId: params.tmdbId,
      kind: params.kind,
      title: params.title,
    })
    .returning();
}

export async function removeFromLikedList(id: string) {
  await db.delete(likedListItems).where(eq(likedListItems.id, id));
}

export async function removeLikedByKey(params: {
  userId: string;
  tmdbId: number;
  kind: LikedKind;
}) {
  await db
    .delete(likedListItems)
    .where(
      and(
        eq(likedListItems.userId, params.userId),
        eq(likedListItems.tmdbId, params.tmdbId),
        eq(likedListItems.kind, params.kind)
      )
    );
}

export async function isLiked(
  tmdbId: number,
  kind: LikedKind,
  userId: string
): Promise<boolean> {
  return likedEntryExists({ userId, tmdbId, kind });
}

export async function isMediaLiked(
  tmdbId: number,
  mediaType: MediaType,
  userId: string
): Promise<boolean> {
  return isLiked(tmdbId, mediaType, userId);
}
