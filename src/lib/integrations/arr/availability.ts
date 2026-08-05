import { getSonarrEpisodes, getSonarrSeries } from "@/lib/integrations/sonarr/client";
import { getDecryptedArrInstance, getIntegrationInstances } from "@/lib/settings/integrations";
import { episodeAvailabilityKey } from "@/lib/utils";

export { episodeAvailabilityKey };

export type SeasonAvailabilityStatus = "available" | "partial";

export type TmdbSeasonEpisodeCount = {
  season_number: number;
  episode_count: number;
};

type SeasonTallies = {
  files: number;
  sonarrEpisodes: number;
  totalEpisodeCount: number;
};

/** Prefer partial when instances disagree — missing episodes should not be hidden. */
function mergeSeasonStatus(
  current: SeasonAvailabilityStatus | undefined,
  next: SeasonAvailabilityStatus
): SeasonAvailabilityStatus {
  if (current === "partial" || next === "partial") return "partial";
  return "available";
}

function statusFromTallies(
  tallies: SeasonTallies,
  tmdbEpisodeCount = 0
): SeasonAvailabilityStatus | null {
  if (tallies.files <= 0) return null;

  // Expected episodes: TMDB catalog count, Sonarr's known episodes, and Sonarr totalEpisodeCount
  // (includes unaired). Using only Sonarr episodeCount/percentOfEpisodes marks seasons
  // "Available" when monitored/aired slices are complete but files are still missing.
  const expected = Math.max(
    tmdbEpisodeCount,
    tallies.sonarrEpisodes,
    tallies.totalEpisodeCount
  );

  if (expected > 0 && tallies.files >= expected) return "available";
  return "partial";
}

function emptyTallies(): SeasonTallies {
  return { files: 0, sonarrEpisodes: 0, totalEpisodeCount: 0 };
}

async function collectSonarrAvailability(
  tmdbId: number,
  tmdbSeasons: TmdbSeasonEpisodeCount[] = []
): Promise<{
  episodes: Set<string>;
  seasons: Record<number, SeasonAvailabilityStatus>;
}> {
  const episodes = new Set<string>();
  const talliesBySeason = new Map<number, SeasonTallies>();
  const tmdbCounts = new Map(
    tmdbSeasons
      .filter((season) => season.season_number > 0)
      .map((season) => [season.season_number, season.episode_count])
  );
  const instances = await getIntegrationInstances("sonarr");

  await Promise.all(
    instances.map(async (instance) => {
      const decrypted = await getDecryptedArrInstance(instance.id);
      if (!decrypted) return;

      try {
        const seriesList = await getSonarrSeries(decrypted);
        const series = seriesList.find((show) => show.tmdbId === tmdbId);
        if (!series) return;

        for (const season of series.seasons ?? []) {
          if (season.seasonNumber <= 0) continue;
          const tallies = talliesBySeason.get(season.seasonNumber) ?? emptyTallies();
          tallies.totalEpisodeCount = Math.max(
            tallies.totalEpisodeCount,
            season.statistics?.totalEpisodeCount ?? 0
          );
          // Prefer Sonarr's file count when present; episode loop below may refine.
          tallies.files = Math.max(
            tallies.files,
            season.statistics?.episodeFileCount ?? 0
          );
          talliesBySeason.set(season.seasonNumber, tallies);
        }

        const sonarrEpisodes = await getSonarrEpisodes(decrypted, series.id);
        const filesFromEpisodes = new Map<number, number>();
        const knownFromEpisodes = new Map<number, number>();

        for (const episode of sonarrEpisodes) {
          if (episode.seasonNumber <= 0) continue;
          knownFromEpisodes.set(
            episode.seasonNumber,
            (knownFromEpisodes.get(episode.seasonNumber) ?? 0) + 1
          );
          if (episode.hasFile) {
            episodes.add(
              episodeAvailabilityKey(episode.seasonNumber, episode.episodeNumber)
            );
            filesFromEpisodes.set(
              episode.seasonNumber,
              (filesFromEpisodes.get(episode.seasonNumber) ?? 0) + 1
            );
          }
        }

        for (const [seasonNumber, known] of knownFromEpisodes) {
          const tallies = talliesBySeason.get(seasonNumber) ?? emptyTallies();
          tallies.sonarrEpisodes = Math.max(tallies.sonarrEpisodes, known);
          tallies.files = Math.max(
            tallies.files,
            filesFromEpisodes.get(seasonNumber) ?? 0
          );
          talliesBySeason.set(seasonNumber, tallies);
        }
      } catch {
        // Skip unreachable Sonarr instances
      }
    })
  );

  const seasons: Record<number, SeasonAvailabilityStatus> = {};
  for (const [seasonNumber, tallies] of talliesBySeason) {
    const status = statusFromTallies(tallies, tmdbCounts.get(seasonNumber) ?? 0);
    if (!status) continue;
    seasons[seasonNumber] = mergeSeasonStatus(seasons[seasonNumber], status);
  }

  // Seasons present only in TMDB episode keys (no Sonarr season row) still get a status.
  for (const [seasonNumber, tmdbCount] of tmdbCounts) {
    if (seasons[seasonNumber]) continue;
    let files = 0;
    for (let episode = 1; episode <= tmdbCount; episode++) {
      if (episodes.has(episodeAvailabilityKey(seasonNumber, episode))) files++;
    }
    const status = statusFromTallies(
      { files, sonarrEpisodes: 0, totalEpisodeCount: 0 },
      tmdbCount
    );
    if (status) seasons[seasonNumber] = status;
  }

  return { episodes, seasons };
}

export async function getSonarrSeasonAvailability(
  tmdbId: number,
  tmdbSeasons: TmdbSeasonEpisodeCount[] = []
): Promise<Record<number, SeasonAvailabilityStatus>> {
  const { seasons } = await collectSonarrAvailability(tmdbId, tmdbSeasons);
  return seasons;
}

export async function getSonarrEpisodeAvailability(tmdbId: number): Promise<Set<string>> {
  const { episodes } = await collectSonarrAvailability(tmdbId);
  return episodes;
}

/** Fetch episode keys and season statuses in one Sonarr pass (preferred on TV detail pages). */
export async function getSonarrTvAvailability(
  tmdbId: number,
  tmdbSeasons: TmdbSeasonEpisodeCount[] = []
): Promise<{
  episodeAvailability: string[];
  seasonAvailability: Record<number, SeasonAvailabilityStatus>;
}> {
  const { episodes, seasons } = await collectSonarrAvailability(tmdbId, tmdbSeasons);
  return {
    episodeAvailability: Array.from(episodes),
    seasonAvailability: seasons,
  };
}
