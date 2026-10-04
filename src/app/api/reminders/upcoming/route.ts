import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listReminders } from "@/lib/reminders";
import { getMovieReleaseDates, getTvAirInfo } from "@/lib/integrations/tmdb/client";
import { getTmdbRegion } from "@/lib/settings/global";
import type { UpcomingRelease } from "@/lib/reminders/client";

export const dynamic = "force-dynamic";

/** TMDB release types: 3 = theatrical, 4 = digital. */
const MOVIE_RELEASE_TYPES: Record<number, string> = { 3: "Theatrical", 4: "Digital" };

/** Only send dates near today; the client narrows to its local calendar week. */
const WINDOW_DAYS = 8;

function withinWindow(date: string, now: number) {
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && Math.abs(time - now) <= WINDOW_DAYS * 86_400_000;
}

async function movieReleases(tmdbId: number, region: string): Promise<UpcomingRelease[]> {
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

async function tvReleases(tmdbId: number): Promise<UpcomingRelease[]> {
  const data = await getTvAirInfo(tmdbId);
  return [data.last_episode_to_air, data.next_episode_to_air].flatMap((episode) =>
    episode?.air_date
      ? [
          {
            date: episode.air_date.slice(0, 10),
            label: `S${episode.season_number}E${episode.episode_number}`,
          },
        ]
      : []
  );
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [reminders, region] = await Promise.all([
    listReminders(session.user.id),
    getTmdbRegion(),
  ]);
  const now = Date.now();

  const items = await Promise.all(
    reminders.map(async (item) => {
      try {
        const releases =
          item.mediaType === "movie"
            ? await movieReleases(item.tmdbId, region)
            : await tvReleases(item.tmdbId);
        return {
          id: item.id,
          tmdbId: item.tmdbId,
          mediaType: item.mediaType,
          title: item.title,
          posterPath: item.posterPath,
          releases: releases.filter((release) => withinWindow(release.date, now)),
        };
      } catch {
        return null;
      }
    })
  );

  return NextResponse.json({
    items: items.filter((item) => item && item.releases.length > 0),
  });
}
