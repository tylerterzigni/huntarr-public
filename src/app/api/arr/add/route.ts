import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDecryptedArrInstance, type DecryptedInstance } from "@/lib/settings/integrations";
import {
  lookupRadarrMovie,
  addRadarrMovie,
} from "@/lib/integrations/radarr/client";
import {
  lookupSonarrSeriesMatch,
  addSonarrSeries,
  findExistingSonarrSeries,
  updateSonarrSeries,
  getSonarrEpisodes,
  setSonarrEpisodeMonitor,
  searchSonarrEpisodes,
  searchSonarrSeason,
} from "@/lib/integrations/sonarr/client";
import { getExternalIds } from "@/lib/integrations/tmdb/client";
import type { ArrCredentials } from "@/types";
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
  /** When false, add/monitor only — do not search or download. Defaults to true. */
  searchForMissing: z.boolean().optional().default(true),
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
        addOptions: { searchForMovie: data.searchForMissing },
      };

      await addRadarrMovie(instance, payload);
    } else if (dbInstance.type === "sonarr" && data.mediaType === "tv") {
      let tvdbId: number | undefined;
      let imdbId: string | undefined;
      try {
        const external = await getExternalIds("tv", data.tmdbId);
        tvdbId = external.tvdb_id ?? undefined;
        imdbId = external.imdb_id ?? undefined;
      } catch {
        // Sonarr can still match via tmdb: or title if TMDB extras fail.
      }

      const series = await lookupSonarrSeriesMatch(instance, {
        tmdbId: data.tmdbId,
        tvdbId,
        imdbId,
        title: data.title,
      });
      if (!series) {
        return NextResponse.json({ error: "Series not found" }, { status: 404 });
      }

      const selectedSeasons = new Set(data.seasons ?? []);
      const episodeSelection = new Map<number, Set<number>>();
      for (const entry of data.episodes ?? []) {
        episodeSelection.set(entry.seasonNumber, new Set(entry.episodeNumbers));
      }
      const hasEpisodePicks = episodeSelection.size > 0;
      const lookupSeasons = asSeasonRecords(series.seasons);

      const existing = await findExistingSonarrSeries(instance, {
        seriesId: Number(series.id) || undefined,
        tvdbId: Number(series.tvdbId) || undefined,
        tmdbId: data.tmdbId,
      });

      if (existing) {
        const seasons = mergeSeasonMonitors({
          existingSeasons: asSeasonRecords(existing.seasons),
          lookupSeasons,
          selectedSeasons,
          additive: true,
        });

        const previousEpisodes = await getSonarrEpisodes(instance, existing.id);
        const previouslyMonitored = new Set(
          previousEpisodes.filter((episode) => episode.monitored).map((episode) => episode.id)
        );

        const updated = await updateSonarrSeries(instance, {
          ...existing,
          monitored: true,
          seasons,
        });
        const seriesId = updated.id ?? existing.id;

        const synced = await syncSonarrEpisodeSelection(
          instance,
          seriesId,
          episodeSelection,
          {
            unmonitorUnselected: true,
            preserveMonitoredIds: previouslyMonitored,
            searchUnselectedMonitored: false,
            searchMissing: data.searchForMissing,
          }
        );

        if (data.searchForMissing) {
          const seasonsToSearch = hasEpisodePicks
            ? [...episodeSelection.keys()].filter(
                (seasonNumber) => !synced.seasonsWithEpisodes.has(seasonNumber)
              )
            : [
                ...(selectedSeasons.size > 0
                  ? selectedSeasons
                  : seasons
                      .map((season) => Number(season.seasonNumber ?? 0))
                      .filter((seasonNumber) => seasonNumber > 0)),
              ];

          for (const seasonNumber of seasonsToSearch) {
            await searchSonarrSeason(instance, seriesId, seasonNumber);
          }
        }
      } else {
        const seasons = mergeSeasonMonitors({
          existingSeasons: [],
          lookupSeasons,
          selectedSeasons,
          additive: false,
        });

        const created = await addSonarrSeries(instance, {
          ...series,
          qualityProfileId: data.qualityProfileId ?? instance.config.defaultQualityProfileId ?? 1,
          rootFolderPath: data.rootFolder ?? instance.config.defaultRootFolder ?? "/tv",
          languageProfileId: data.languageProfileId ?? instance.config.defaultLanguageProfileId ?? 1,
          seasonFolder: true,
          monitored: true,
          seasons,
          seriesType: instance.config.defaultSeriesType ?? "standard",
          addOptions: {
            searchForMissingEpisodes: data.searchForMissing && !hasEpisodePicks,
            searchForCutoffUnmetEpisodes: false,
          },
        });

        if (hasEpisodePicks && typeof created.id === "number") {
          await syncSonarrEpisodeSelection(instance, created.id, episodeSelection, {
            unmonitorUnselected: true,
            searchUnselectedMonitored: data.searchForMissing,
            searchMissing: data.searchForMissing,
          });
        }
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

type ArrInstance = DecryptedInstance<ArrCredentials>;

type SeasonRecord = Record<string, unknown> & {
  seasonNumber?: number;
  monitored?: boolean;
};

function asSeasonRecords(value: unknown): SeasonRecord[] {
  return Array.isArray(value) ? (value as SeasonRecord[]) : [];
}

function mergeSeasonMonitors({
  existingSeasons,
  lookupSeasons,
  selectedSeasons,
  additive,
}: {
  existingSeasons: SeasonRecord[];
  lookupSeasons: SeasonRecord[];
  selectedSeasons: Set<number>;
  additive: boolean;
}): SeasonRecord[] {
  const existingByNumber = new Map(
    existingSeasons.map((season) => [Number(season.seasonNumber ?? 0), season])
  );
  const source = lookupSeasons.length > 0 ? lookupSeasons : existingSeasons;
  const seen = new Set<number>();

  const merged = source.map((season) => {
    const seasonNumber = Number(season.seasonNumber ?? 0);
    seen.add(seasonNumber);
    const existingSeason = existingByNumber.get(seasonNumber);
    const alreadyMonitored = Boolean(existingSeason?.monitored);
    const requested =
      selectedSeasons.size > 0 ? selectedSeasons.has(seasonNumber) : seasonNumber > 0;
    return {
      ...(existingSeason ?? { seasonNumber }),
      monitored: additive ? alreadyMonitored || requested : requested,
    };
  });

  for (const [seasonNumber, existingSeason] of existingByNumber) {
    if (seen.has(seasonNumber)) continue;
    const requested = selectedSeasons.has(seasonNumber);
    merged.push({
      ...existingSeason,
      monitored: additive ? Boolean(existingSeason.monitored) || requested : requested,
    });
  }

  return merged;
}

async function syncSonarrEpisodeSelection(
  instance: ArrInstance,
  seriesId: number,
  episodeSelection: Map<number, Set<number>>,
  options: {
    unmonitorUnselected: boolean;
    searchUnselectedMonitored: boolean;
    preserveMonitoredIds?: Set<number>;
    searchMissing?: boolean;
  }
) {
  const seasonsWithEpisodes = new Set<number>();
  if (episodeSelection.size === 0) {
    return { seasonsWithEpisodes };
  }

  const searchMissing = options.searchMissing !== false;
  const sonarrEpisodes = await getSonarrEpisodes(instance, seriesId);
  const toUnmonitor: number[] = [];
  const toMonitor: number[] = [];
  const toSearch: number[] = [];

  for (const episode of sonarrEpisodes) {
    const selected = episodeSelection.get(episode.seasonNumber);
    if (!selected) {
      if (
        searchMissing &&
        options.searchUnselectedMonitored &&
        episode.monitored &&
        !episode.hasFile
      ) {
        toSearch.push(episode.id);
      }
      continue;
    }

    seasonsWithEpisodes.add(episode.seasonNumber);
    const shouldMonitor = selected.has(episode.episodeNumber);
    if (shouldMonitor && !episode.monitored) {
      toMonitor.push(episode.id);
    } else if (
      !shouldMonitor &&
      episode.monitored &&
      options.unmonitorUnselected &&
      !options.preserveMonitoredIds?.has(episode.id)
    ) {
      toUnmonitor.push(episode.id);
    }
    if (searchMissing && shouldMonitor && !episode.hasFile) {
      toSearch.push(episode.id);
    }
  }

  await setSonarrEpisodeMonitor(instance, toUnmonitor, false);
  await setSonarrEpisodeMonitor(instance, toMonitor, true);
  await searchSonarrEpisodes(instance, toSearch);

  return { seasonsWithEpisodes };
}
