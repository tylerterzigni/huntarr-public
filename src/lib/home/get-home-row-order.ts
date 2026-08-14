import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  normalizeHomeRowHidden,
  normalizeHomeRowOrder,
  visibleHomeRows,
  type HomeRowId,
} from "@/lib/home/row-order";

export async function getHomeRowOrder(userId: string): Promise<HomeRowId[]> {
  const [prefs] = await db
    .select({
      homeRowOrder: userPreferences.homeRowOrder,
      homeRowHidden: userPreferences.homeRowHidden,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  return visibleHomeRows(
    normalizeHomeRowOrder(prefs?.homeRowOrder),
    normalizeHomeRowHidden(prefs?.homeRowHidden)
  );
}
