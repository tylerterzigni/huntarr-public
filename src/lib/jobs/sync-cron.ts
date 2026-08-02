import {
  startSyncJob,
  waitForSyncJob,
} from "@/lib/integrations/sync-jobs";
import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import cron from "node-cron";

let initialized = false;

export function initBackgroundJobs() {
  if (initialized || process.env.NODE_ENV !== "production") return;
  initialized = true;

  cron.schedule("*/30 * * * *", async () => {
    try {
      const prefs = await db.select().from(userPreferences);
      const usernames = [...new Set(prefs.flatMap((p) => p.tautulliUsernames ?? []))];
      // Prefer any user id for taste-profile rebuild after Tautulli; fall back to system.
      const userId = prefs[0]?.userId ?? "system";

      const plex = startSyncJob({
        service: "plex",
        userId,
        usernames,
        rebuildTasteProfile: false,
      });
      const plexDone = await waitForSyncJob(plex.job.id);
      if (plexDone.status === "error") {
        throw new Error(plexDone.error ?? "Plex sync failed");
      }

      if (usernames.length > 0) {
        const tautulli = startSyncJob({
          service: "tautulli",
          userId,
          usernames,
          rebuildTasteProfile: true,
        });
        const tautulliDone = await waitForSyncJob(tautulli.job.id);
        if (tautulliDone.status === "error") {
          throw new Error(tautulliDone.error ?? "Tautulli sync failed");
        }
      }
    } catch (err) {
      console.error("Background sync failed:", err);
    }
  });
}
