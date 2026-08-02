import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  startSyncJob,
  waitForSyncJob,
} from "@/lib/integrations/sync-jobs";
import { getGlobalSetting, setGlobalSetting } from "@/lib/settings/global";
import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DAILY_SYNC_KEY = "last_daily_sync_date";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

let dailySyncInFlight = false;

async function runDailySync(userId: string) {
  const prefs = await db.select().from(userPreferences);
  const usernames = [...new Set(prefs.flatMap((p) => p.tautulliUsernames ?? []))];

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
}

/**
 * First authenticated page load of the local calendar day triggers a background
 * Plex library + Tautulli watch-history refresh (non-blocking).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let date: string | undefined;
  try {
    const body = await request.json();
    date = typeof body?.date === "string" ? body.date : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const last = await getGlobalSetting(DAILY_SYNC_KEY);
  if (last === date) {
    return NextResponse.json({ skipped: true, reason: "already_synced_today" });
  }

  if (dailySyncInFlight) {
    return NextResponse.json({ skipped: true, reason: "sync_in_progress" });
  }

  dailySyncInFlight = true;
  await setGlobalSetting(DAILY_SYNC_KEY, date);

  void runDailySync(session.user.id)
    .catch((err) => {
      console.error("Daily background sync failed:", err);
    })
    .finally(() => {
      dailySyncInFlight = false;
    });

  return NextResponse.json({ started: true, date });
}
