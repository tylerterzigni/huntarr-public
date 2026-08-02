import cron from "node-cron";
import { syncPlexLibrary, syncTautulliHistory } from "@/lib/integrations/sync";
import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";

let initialized = false;

export function initBackgroundJobs() {
  if (initialized || process.env.NODE_ENV !== "production") return;
  initialized = true;

  cron.schedule("*/30 * * * *", async () => {
    try {
      await syncPlexLibrary();
      const prefs = await db.select().from(userPreferences);
      const usernames = [...new Set(prefs.flatMap((p) => p.tautulliUsernames ?? []))];
      if (usernames.length > 0) {
        await syncTautulliHistory(usernames);
      }
    } catch (err) {
      console.error("Background sync failed:", err);
    }
  });
}
