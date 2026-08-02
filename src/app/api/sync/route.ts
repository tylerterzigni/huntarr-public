import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncPlexLibrary, syncTautulliHistory } from "@/lib/integrations/sync";
import { buildTasteProfile, clearForYouRecommendationCache } from "@/lib/recommendations/engine";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { service } = await request.json();

  try {
    if (service === "plex") {
      const result = await syncPlexLibrary();
      return NextResponse.json(result);
    }

    if (service === "tautulli") {
      const [prefs] = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, session.user.id))
        .limit(1);

      const usernames = prefs?.tautulliUsernames ?? [];
      const result = await syncTautulliHistory(usernames);
      await buildTasteProfile(session.user.id);
      clearForYouRecommendationCache(session.user.id);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown service" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
