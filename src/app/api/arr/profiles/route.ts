import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDecryptedArrInstance } from "@/lib/settings/integrations";
import {
  getRadarrProfiles,
  getRadarrRootFolders,
} from "@/lib/integrations/radarr/client";
import {
  getSonarrProfiles,
  getSonarrRootFolders,
  getSonarrLanguageProfiles,
} from "@/lib/integrations/sonarr/client";
import { db } from "@/lib/db";
import { integrationInstances } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get("instanceId");
  if (!instanceId) {
    return NextResponse.json({ error: "instanceId required" }, { status: 400 });
  }

  const instance = await getDecryptedArrInstance(instanceId);
  if (!instance) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [dbInstance] = await db
    .select()
    .from(integrationInstances)
    .where(eq(integrationInstances.id, instanceId))
    .limit(1);

  try {
    if (dbInstance.type === "radarr") {
      const [profiles, folders] = await Promise.all([
        getRadarrProfiles(instance),
        getRadarrRootFolders(instance),
      ]);
      return NextResponse.json({ profiles, folders });
    }

    const [profiles, folders, languageProfiles] = await Promise.all([
      getSonarrProfiles(instance),
      getSonarrRootFolders(instance),
      getSonarrLanguageProfiles(instance),
    ]);
    return NextResponse.json({ profiles, folders, languageProfiles });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch profiles" },
      { status: 500 }
    );
  }
}
