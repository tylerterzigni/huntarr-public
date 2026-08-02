import { eq, or, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { hideListItems } from "@/lib/db/schema";
import type { MediaType } from "@/types";

export async function listHideItems(userId: string, scope?: "global" | "user") {
  if (scope === "global") {
    return db.select().from(hideListItems).where(eq(hideListItems.scope, "global"));
  }
  if (scope === "user") {
    return db
      .select()
      .from(hideListItems)
      .where(and(eq(hideListItems.scope, "user"), eq(hideListItems.userId, userId)));
  }
  return db
    .select()
    .from(hideListItems)
    .where(
      or(
        eq(hideListItems.scope, "global"),
        and(eq(hideListItems.scope, "user"), eq(hideListItems.userId, userId))
      )
    );
}

export async function hideEntryExists(params: {
  tmdbId: number;
  mediaType: MediaType;
  scope: "global" | "user";
  userId?: string;
}): Promise<boolean> {
  const conditions =
    params.scope === "global"
      ? and(
          eq(hideListItems.scope, "global"),
          eq(hideListItems.tmdbId, params.tmdbId),
          eq(hideListItems.mediaType, params.mediaType)
        )
      : and(
          eq(hideListItems.scope, "user"),
          eq(hideListItems.userId, params.userId!),
          eq(hideListItems.tmdbId, params.tmdbId),
          eq(hideListItems.mediaType, params.mediaType)
        );

  const rows = await db.select().from(hideListItems).where(conditions).limit(1);
  return rows.length > 0;
}

export async function addToHideList(params: {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  scope: "global" | "user";
  userId?: string;
  reason?: string;
}) {
  return db
    .insert(hideListItems)
    .values({
      tmdbId: params.tmdbId,
      mediaType: params.mediaType,
      title: params.title,
      scope: params.scope,
      userId: params.scope === "user" ? params.userId : null,
      reason: params.reason,
    })
    .returning();
}

export async function removeFromHideList(id: string) {
  await db.delete(hideListItems).where(eq(hideListItems.id, id));
}

export async function isHidden(
  tmdbId: number,
  mediaType: MediaType,
  userId: string
): Promise<boolean> {
  const rows = await db
    .select()
    .from(hideListItems)
    .where(
      or(
        and(
          eq(hideListItems.scope, "global"),
          eq(hideListItems.tmdbId, tmdbId),
          eq(hideListItems.mediaType, mediaType)
        ),
        and(
          eq(hideListItems.scope, "user"),
          eq(hideListItems.userId, userId),
          eq(hideListItems.tmdbId, tmdbId),
          eq(hideListItems.mediaType, mediaType)
        )
      )
    );
  return rows.length > 0;
}
