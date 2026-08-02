import { Suspense } from "react";
import { requireAuth } from "@/lib/auth/session";
import { MainLayout } from "@/components/layout/MainLayout";
import {
  discoverMovies,
  discoverMoviesMultiPage,
  getGenres,
  resolveKeywords,
} from "@/lib/integrations/tmdb/client";
import { enrichWithStatus, withoutHiddenItems } from "@/lib/recommendations/filters";
import { DiscoverFilters } from "@/components/discover/DiscoverFilters";
import { DiscoverPageBody } from "@/components/discover/DiscoverPageBody";
import { parseListParam, serializeDiscoverParams } from "@/components/discover/filter-utils";
import { buildMovieDiscoverFilters } from "@/lib/discover/build-filters";
import { mergeMovieGenres } from "@/lib/discover/genres";
import { DISCOVER_INITIAL_PAGES } from "@/lib/recommendations/constants";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function MoviesPage({ searchParams }: PageProps) {
  const session = await requireAuth();
  const params = await searchParams;
  const filters = buildMovieDiscoverFilters(params);

  const keywordIds = parseListParam(params.keywords).map(Number).filter(Boolean);
  const excludeKeywordIds = parseListParam(params.excludeKeywords).map(Number).filter(Boolean);

  let genres: Awaited<ReturnType<typeof getGenres>>["genres"] = [];
  let initialKeywords: Awaited<ReturnType<typeof resolveKeywords>> = [];
  let initialExcludeKeywords: Awaited<ReturnType<typeof resolveKeywords>> = [];
  let results: Awaited<ReturnType<typeof discoverMoviesMultiPage>> = [];
  let totalPages = 1;

  try {
    const [genreList, keywords, excludeKeywords] = await Promise.all([
      getGenres("movie"),
      keywordIds.length ? resolveKeywords(keywordIds) : Promise.resolve([]),
      excludeKeywordIds.length ? resolveKeywords(excludeKeywordIds) : Promise.resolve([]),
    ]);
    genres = mergeMovieGenres(genreList.genres);
    initialKeywords = keywords;
    initialExcludeKeywords = excludeKeywords;
  } catch {
    // TMDB not configured
  }

  try {
    const [firstPage, discoverResults] = await Promise.all([
      discoverMovies({ ...filters, page: "1" }),
      discoverMoviesMultiPage(filters, DISCOVER_INITIAL_PAGES),
    ]);
    results = discoverResults;
    totalPages = firstPage.total_pages;
  } catch {
    // Discover request failed
  }

  const enriched = withoutHiddenItems(await enrichWithStatus(results, session.user.id));

  return (
    <MainLayout username={session.user.name}>
      <div className="px-4 md:px-8 py-8">
        <DiscoverPageBody
          key={serializeDiscoverParams(params)}
          title="Discover Movies"
          mediaType="movie"
          initialItems={enriched}
          filterParams={params}
          initialPagesLoaded={DISCOVER_INITIAL_PAGES}
          totalPages={totalPages}
          filters={
            <Suspense>
              <DiscoverFilters
                genres={genres}
                mediaType="movie"
                initialKeywords={initialKeywords}
                initialExcludeKeywords={initialExcludeKeywords}
              />
            </Suspense>
          }
        />
      </div>
    </MainLayout>
  );
}
