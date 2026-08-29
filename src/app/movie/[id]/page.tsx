import { requireAuth } from "@/lib/auth/session";
import { MainLayout } from "@/components/layout/MainLayout";
import { getMovieDetails } from "@/lib/integrations/tmdb/client";
import { getRottenTomatoesRatings } from "@/lib/integrations/rottentomatoes/client";
import { TitleDetailClient } from "@/components/media/TitleDetailClient";
import { TitleDetailRelated } from "@/components/media/TitleDetailRelated";
import { getDetailRelatedItems } from "@/lib/integrations/tmdb/related";
import { getLibraryIds, getPlexLibraryIds, getWatchedIds } from "@/lib/recommendations/filters";
import { getDownloadedMovieIds } from "@/lib/integrations/arr/library";
import { getPlexPlayUrl } from "@/lib/integrations/plex/play-url";
import { isHidden } from "@/lib/hide-list";
import { isMediaLiked } from "@/lib/liked-list";
import { getTmdbRegion } from "@/lib/settings/global";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function MoviePage({ params }: PageProps) {
  const session = await requireAuth();
  const { id } = await params;
  const tmdbId = parseInt(id, 10);

  let details: Record<string, unknown> = {};
  try {
    details = await getMovieDetails(tmdbId);
  } catch {
    return (
      <MainLayout username={session.user.name}>
        <div className="p-8 text-center">Movie not found or TMDB not configured.</div>
      </MainLayout>
    );
  }

  const [libraryIds, plexIds, downloadedMovieIds] = await Promise.all([
    getLibraryIds(),
    getPlexLibraryIds(),
    getDownloadedMovieIds().catch(() => new Set<string>()),
  ]);
  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, session.user.id))
    .limit(1);
  const watchedIds = await getWatchedIds(prefs?.tautulliUsernames ?? []);
  const hidden = await isHidden(tmdbId, "movie", session.user.id);
  const liked = await isMediaLiked(tmdbId, "movie", session.user.id);
  const watchRegion = await getTmdbRegion();
  const title = (details.title as string) ?? "";
  const releaseYear = Number((details.release_date as string | undefined)?.slice(0, 4));
  const rtRatings = await getRottenTomatoesRatings(
    "movie",
    title,
    Number.isFinite(releaseYear) ? releaseYear : undefined
  );
  const movieKey = `movie:${tmdbId}`;
  // Treat Radarr hasFile like Plex so Request becomes Play on Plex + trailer, matching TV.
  const inPlex = plexIds.has(movieKey) || downloadedMovieIds.has(movieKey);
  const plexPlayUrl = inPlex ? await getPlexPlayUrl(tmdbId, "movie", title) : null;
  const { recommendations, similar } = await getDetailRelatedItems(
    details,
    "movie",
    tmdbId,
    session.user.id,
    prefs?.tautulliUsernames ?? []
  );

  return (
    <MainLayout username={session.user.name}>
      <TitleDetailClient
        details={details}
        mediaType="movie"
        tmdbId={tmdbId}
        inLibrary={libraryIds.has(movieKey)}
        inPlex={inPlex}
        plexPlayUrl={plexPlayUrl}
        watched={watchedIds.has(movieKey)}
        isHidden={hidden}
        isLiked={liked}
        isAdmin={session.user.role === "admin"}
        watchRegion={watchRegion}
        rtRatings={rtRatings}
      />
      <TitleDetailRelated recommendations={recommendations} similar={similar} />
    </MainLayout>
  );
}
