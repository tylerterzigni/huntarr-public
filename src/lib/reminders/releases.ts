import { getMovieReleaseDates, getTvAirInfo } from "@/lib/integrations/tmdb/client";
import type { UpcomingRelease } from "@/lib/reminders/client";
import type { MediaType } from "@/types";

/** TMDB release types: 3 = theatrical, 4 = digital. */
const MOVIE_RELEASE_TYPES: Record<number, string> = { 3: "Theatrical", 4: "Digital" };

export async function movieReleases(tmdbId: number, region: string): Promise<UpcomingRelease[]> {
  const data = await getMovieReleaseDates(tmdbId);
  const results = data.results ?? [];
  const regional =
    results.find((r) => r.iso_3166_1 === region) ?? results.find((r) => r.iso_3166_1 === "US");
  const releases: UpcomingRelease[] = [];
  for (const release of regional?.release_dates ?? []) {
    const label = MOVIE_RELEASE_TYPES[release.type];
    if (label && release.release_date) {
      releases.push({ date: release.release_date.slice(0, 10), label });
    }
  }
  return releases;
}

function episodeRelease(
  episode: Awaited<ReturnType<typeof getTvAirInfo>>["next_episode_to_air"]
): UpcomingRelease | null {
  return episode?.air_date
    ? {
        date: episode.air_date.slice(0, 10),
        label: `S${episode.season_number}E${episode.episode_number}`,
      }
    : null;
}

export async function tvReleases(tmdbId: number): Promise<UpcomingRelease[]> {
  const data = await getTvAirInfo(tmdbId);
  return [data.last_episode_to_air, data.next_episode_to_air].flatMap((episode) => {
    const release = episodeRelease(episode);
    return release ? [release] : [];
  });
}

function earliest(releases: UpcomingRelease[], label: string) {
  return (
    releases
      .filter((release) => release.label === label)
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  );
}

/**
 * The one date a reminder is shown and sorted by: a movie's digital release (theatrical when
 * TMDB has no digital date), or a show's next episode (last aired when nothing is scheduled).
 */
export async function primaryRelease(
  item: { tmdbId: number; mediaType: MediaType },
  region: string
): Promise<UpcomingRelease | null> {
  if (item.mediaType === "movie") {
    const releases = await movieReleases(item.tmdbId, region);
    return earliest(releases, "Digital") ?? earliest(releases, "Theatrical");
  }
  const data = await getTvAirInfo(item.tmdbId);
  return episodeRelease(data.next_episode_to_air) ?? episodeRelease(data.last_episode_to_air);
}
