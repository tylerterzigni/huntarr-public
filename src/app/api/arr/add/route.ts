import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDecryptedArrInstance } from "@/lib/settings/integrations";
import {
  lookupRadarrMovie,
  addRadarrMovie,
} from "@/lib/integrations/radarr/client";
import {
  lookupSonarrByTmdb,
  addSonarrSeries,
} from "@/lib/integrations/sonarr/client";
import { clearArrLibraryCache } from "@/lib/integrations/arr/library";
import { db } from "@/lib/db";
import { arrRequestsLog, integrationInstances } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const addSchema = z.object({
  instanceId: z.string().uuid(),
  tmdbId: z.number(),
  mediaType: z.enum(["movie", "tv"]),
  title: z.string(),
  qualityProfileId: z.number().optional(),
  rootFolder: z.string().optional(),
  languageProfileId: z.number().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = addSchema.parse(body);
    const instance = await getDecryptedArrInstance(data.instanceId);
    if (!instance) {
      return NextResponse.json({ error: "Instance not found" }, { status: 404 });
    }

    const [dbInstance] = await db
      .select()
      .from(integrationInstances)
      .where(eq(integrationInstances.id, data.instanceId))
      .limit(1);

    if (dbInstance.type === "radarr" && data.mediaType === "movie") {
      const movie = await lookupRadarrMovie(instance, data.tmdbId);
      if (!movie) {
        return NextResponse.json({ error: "Movie not found on TMDB/Radarr" }, { status: 404 });
      }

      const payload = {
        ...movie,
        qualityProfileId: data.qualityProfileId ?? instance.config.defaultQualityProfileId ?? 1,
        rootFolderPath: data.rootFolder ?? instance.config.defaultRootFolder ?? "/movies",
        monitored: true,
        addOptions: { searchForMovie: true },
      };

      await addRadarrMovie(instance, payload);
    } else if (dbInstance.type === "sonarr" && data.mediaType === "tv") {
      const series = await lookupSonarrByTmdb(instance, data.tmdbId);
      if (!series) {
        return NextResponse.json({ error: "Series not found" }, { status: 404 });
      }

      const payload = {
        ...series,
        qualityProfileId: data.qualityProfileId ?? instance.config.defaultQualityProfileId ?? 1,
        rootFolderPath: data.rootFolder ?? instance.config.defaultRootFolder ?? "/tv",
        languageProfileId: data.languageProfileId ?? instance.config.defaultLanguageProfileId ?? 1,
        seasonFolder: true,
        monitored: true,
        seriesType: instance.config.defaultSeriesType ?? "standard",
        addOptions: { searchForMissingEpisodes: true },
      };

      await addSonarrSeries(instance, payload);
    } else {
      return NextResponse.json({ error: "Invalid instance/type combination" }, { status: 400 });
    }

    await db.insert(arrRequestsLog).values({
      userId: session.user.id,
      instanceId: data.instanceId,
      tmdbId: data.tmdbId,
      mediaType: data.mediaType,
      title: data.title,
      status: "added",
    });

    clearArrLibraryCache();

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add" },
      { status: 500 }
    );
  }
}
