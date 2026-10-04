import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listReminders } from "@/lib/reminders";
import { movieReleases, tvReleases } from "@/lib/reminders/releases";
import { getTmdbRegion } from "@/lib/settings/global";

export const dynamic = "force-dynamic";

/** Only send dates near today; the client narrows to its local calendar week. */
const WINDOW_DAYS = 8;

function withinWindow(date: string, now: number) {
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && Math.abs(time - now) <= WINDOW_DAYS * 86_400_000;
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
          year: item.year,
          posterPath: item.posterPath,
          trailerUrl: item.trailerUrl,
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
