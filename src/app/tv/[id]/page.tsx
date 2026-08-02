import { requireAuth } from "@/lib/auth/session";
import { MainLayout } from "@/components/layout/MainLayout";
import { getTvDetails } from "@/lib/integrations/tmdb/client";
import { getRottenTomatoesRatings } from "@/lib/integrations/rottentomatoes/client";
import { TitleDetailClient } from "@/components/media/TitleDetailClient";
import { TitleDetailRelated } from "@/components/media/TitleDetailRelated";
import { getDetailRelatedItems } from "@/lib/integrations/tmdb/related";
import { getLibraryIds, getPlexLibraryIds, getWatchedIds } from "@/lib/recommendations/filters";
import { isHidden } from "@/lib/hide-list";
import { isMediaLiked } from "@/lib/liked-list";
import { getPlexPlayUrl } from "@/lib/integrations/plex/play-url";
import { getSonarrEpisodeAvailability } from "@/lib/integrations/arr/availability";
import { getTmdbRegion } from "@/lib/settings/global";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function TvDetailPage({ params }: PageProps) {
  const session = await requireAuth();
  const { id } = await params;
  const tmdbId = parseInt(id, 10);

  let details: Record<string, unknown> = {};
  try {
    details = await getTvDetails(tmdbId);
  } catch {
    return (
      <MainLayout username={session.user.name}>
        <div className="p-8 text-center">TV show not found or TMDB not configured.</div>
      </MainLayout>
    );
  }

  const libraryIds = await getLibraryIds();
  const plexIds = await getPlexLibraryIds();
  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, session.user.id))
    .limit(1);
  const watchedIds = await getWatchedIds(prefs?.tautulliUsernames ?? []);
  const hidden = await isHidden(tmdbId, "tv", session.user.id);
  const liked = await isMediaLiked(tmdbId, "tv", session.user.id);
  const watchRegion = await getTmdbRegion();
  const title = (details.name as string) ?? "";
  const releaseYear = Number((details.first_air_date as string | undefined)?.slice(0, 4));
  const rtRatings = await getRottenTomatoesRatings(
    "tv",
    title,
    Number.isFinite(releaseYear) ? releaseYear : undefined
  );

  const keywordsData = details.keywords as { results?: Array<{ id: number; name: string }> } | undefined;
  const keywords = keywordsData?.results ?? [];
  const seasons =
    (details.seasons as Array<{ season_number: number; episode_count: number; name?: string }>) ??
    [];
  const episodeAvailability = Array.from(await getSonarrEpisodeAvailability(tmdbId));
  const inPlex = plexIds.has(`tv:${tmdbId}`);
  const plexPlayUrl = inPlex ? await getPlexPlayUrl(tmdbId, "tv", title) : null;
  const { recommendations, similar } = await getDetailRelatedItems(
    details,
    "tv",
    tmdbId,
    session.user.id,
    prefs?.tautulliUsernames ?? []
  );

  return (
    <MainLayout username={session.user.name}>
      <TitleDetailClient
        details={details}
        mediaType="tv"
        tmdbId={tmdbId}
        inLibrary={libraryIds.has(`tv:${tmdbId}`)}
        inPlex={inPlex}
        plexPlayUrl={plexPlayUrl}
        watched={watchedIds.has(`tv:${tmdbId}`)}
        isHidden={hidden}
        isLiked={liked}
        isAdmin={session.user.role === "admin"}
        watchRegion={watchRegion}
        rtRatings={rtRatings}
        keywords={keywords}
        seasons={seasons}
        episodeAvailability={episodeAvailability}
      />
      <TitleDetailRelated recommendations={recommendations} similar={similar} />
    </MainLayout>
  );
}
