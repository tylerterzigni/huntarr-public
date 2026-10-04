import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { reminderItems } from "@/lib/db/schema";
import type { MediaType } from "@/types";

export async function listReminders(userId: string) {
  return db
    .select()
    .from(reminderItems)
    .where(eq(reminderItems.userId, userId))
    .orderBy(reminderItems.createdAt);
}

export async function getReminder(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(reminderItems)
    .where(and(eq(reminderItems.userId, userId), eq(reminderItems.id, id)))
    .limit(1);
  return row ?? null;
}

export async function findReminderByKey(params: {
  userId: string;
  tmdbId: number;
  mediaType: MediaType;
}) {
  const [row] = await db
    .select()
    .from(reminderItems)
    .where(
      and(
        eq(reminderItems.userId, params.userId),
        eq(reminderItems.tmdbId, params.tmdbId),
        eq(reminderItems.mediaType, params.mediaType)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function isReminded(
  tmdbId: number,
  mediaType: MediaType,
  userId: string
): Promise<boolean> {
  return (await findReminderByKey({ userId, tmdbId, mediaType })) != null;
}

/** True when another user still has a reminder for the same title. */
export async function hasOtherReminders(params: {
  tmdbId: number;
  mediaType: MediaType;
  excludeId: string;
}): Promise<boolean> {
  const rows = await db
    .select({ id: reminderItems.id })
    .from(reminderItems)
    .where(
      and(
        eq(reminderItems.tmdbId, params.tmdbId),
        eq(reminderItems.mediaType, params.mediaType),
        ne(reminderItems.id, params.excludeId)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function addReminder(values: typeof reminderItems.$inferInsert) {
  const [row] = await db.insert(reminderItems).values(values).returning();
  return row;
}

export async function removeReminder(id: string) {
  await db.delete(reminderItems).where(eq(reminderItems.id, id));
}
