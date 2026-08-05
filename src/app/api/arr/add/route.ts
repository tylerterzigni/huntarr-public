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
  getSonarrEpisodes,
  setSonarrEpisodeMonitor,
  searchSonarrEpisodes,
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
  /** Season numbers to monitor; omitted seasons (and specials unless listed) are unmonitored. */
  seasons: z.array(z.number().int().min(0)).optional(),
  /**
   * Optional per-season episode picks. When present for a season, only those
   * episodes stay monitored after add; other episodes in that season are unmonitored.
   */
  episodes: z
    .array(
      z.object({
        seasonNumber: z.number().int().min(0),
        episodeNumbers: z.array(z.number().int().min(1)),
      })
    )
    .optional(),
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

      const selectedSeasons = new Set(data.seasons ?? []);
      const episodeSelection = new Map<number, Set<number>>();
      for (const entry of data.episodes ?? []) {
        episodeSelection.set(entry.seasonNumber, new Set(entry.episodeNumbers));
      }
      const hasPartialEpisodes = episodeSelection.size > 0;

      const lookupSeasons = Array.isArray(series.seasons)
        ? (series.seasons as Array<Record<string, unknown>>)
        : [];
      const seasons =
        selectedSeasons.size > 0
          ? lookupSeasons.map((season) => {
              const seasonNumber = Number(season.seasonNumber ?? 0);
              return {
                ...season,
                monitored: selectedSeasons.has(seasonNumber),
              };
            })
          : lookupSeasons.map((season) => ({
              ...season,
              // Default: monitor regular seasons only (not specials)
              monitored: Number(season.seasonNumber ?? 0) > 0,
            }));

      const payload = {
        ...series,
        qualityProfileId: data.qualityProfileId ?? instance.config.defaultQualityProfileId ?? 1,
        rootFolderPath: data.rootFolder ?? instance.config.defaultRootFolder ?? "/tv",
        languageProfileId: data.languageProfileId ?? instance.config.defaultLanguageProfileId ?? 1,
        seasonFolder: true,
        monitored: true,
        seasons,
        seriesType: instance.config.defaultSeriesType ?? "standard",
        addOptions: {
          // Defer search until after per-episode monitors are applied when needed
          searchForMissingEpisodes: !hasPartialEpisodes,
          searchForCutoffUnmetEpisodes: false,
        },
      };

      const created = await addSonarrSeries(instance, payload);

      if (hasPartialEpisodes && typeof created.id === "number") {
        const sonarrEpisodes = await getSonarrEpisodes(instance, created.id);
        const toUnmonitor: number[] = [];
        const toMonitor: number[] = [];
        const toSearch: number[] = [];

        for (const episode of sonarrEpisodes) {
          const selected = episodeSelection.get(episode.seasonNumber);
          if (!selected) {
            if (episode.monitored && !episode.hasFile) {
              toSearch.push(episode.id);
            }
            continue;
          }

          const shouldMonitor = selected.has(episode.episodeNumber);
          if (shouldMonitor && !episode.monitored) {
            toMonitor.push(episode.id);
          } else if (!shouldMonitor && episode.monitored) {
            toUnmonitor.push(episode.id);
          }
          if (shouldMonitor && !episode.hasFile) {
            toSearch.push(episode.id);
          }
        }

        await setSonarrEpisodeMonitor(instance, toUnmonitor, false);
        await setSonarrEpisodeMonitor(instance, toMonitor, true);
        await searchSonarrEpisodes(instance, toSearch);
      }
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
