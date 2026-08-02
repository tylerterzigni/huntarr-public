import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { startSyncJob, type SyncService } from "@/lib/integrations/sync-jobs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Starts a background sync job and returns immediately.
 * Progress is available via GET /api/sync/status — the job keeps running
 * even if the client navigates away.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let service: string | undefined;
  try {
    const body = await request.json();
    service = body?.service;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (service !== "plex" && service !== "tautulli") {
    return NextResponse.json({ error: "Unknown service" }, { status: 400 });
  }

  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, session.user.id))
    .limit(1);

  const { job, started } = startSyncJob({
    service: service as SyncService,
    userId: session.user.id,
    usernames: prefs?.tautulliUsernames ?? [],
    rebuildTasteProfile: service === "tautulli",
  });

  return NextResponse.json({ jobId: job.id, started, job });
}
