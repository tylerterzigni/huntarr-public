import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { normalizeHomeRowOrder, type HomeRowId } from "@/lib/home/row-order";

export async function getHomeRowOrder(userId: string): Promise<HomeRowId[]> {
  const [prefs] = await db
    .select({ homeRowOrder: userPreferences.homeRowOrder })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  return normalizeHomeRowOrder(prefs?.homeRowOrder);
}
