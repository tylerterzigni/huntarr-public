import { Suspense } from "react";
import { requireAuth } from "@/lib/auth/session";
import { MainLayout } from "@/components/layout/MainLayout";
import {
  discoverTv,
  discoverTvMultiPage,
  getGenres,
  resolveKeywords,
} from "@/lib/integrations/tmdb/client";
import { enrichWithStatus, withoutHiddenItems } from "@/lib/recommendations/filters";
import { DiscoverFilters } from "@/components/discover/DiscoverFilters";
import { DiscoverPageBody } from "@/components/discover/DiscoverPageBody";
import { parseListParam } from "@/components/discover/filter-utils";
import { buildTvDiscoverFilters } from "@/lib/discover/build-filters";
import { DISCOVER_INITIAL_PAGES } from "@/lib/recommendations/constants";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function TvPage({ searchParams }: PageProps) {
  const session = await requireAuth();
  const params = await searchParams;
  const filters = buildTvDiscoverFilters(params);

  const keywordIds = parseListParam(params.keywords).map(Number).filter(Boolean);
  const excludeKeywordIds = parseListParam(params.excludeKeywords).map(Number).filter(Boolean);

  let genres: Awaited<ReturnType<typeof getGenres>>["genres"] = [];
  let initialKeywords: Awaited<ReturnType<typeof resolveKeywords>> = [];
  let initialExcludeKeywords: Awaited<ReturnType<typeof resolveKeywords>> = [];
  let results: Awaited<ReturnType<typeof discoverTvMultiPage>> = [];
  let totalPages = 1;

  try {
    const [genreList, keywords, excludeKeywords] = await Promise.all([
      getGenres("tv"),
      keywordIds.length ? resolveKeywords(keywordIds) : Promise.resolve([]),
      excludeKeywordIds.length ? resolveKeywords(excludeKeywordIds) : Promise.resolve([]),
    ]);
    genres = genreList.genres;
    initialKeywords = keywords;
    initialExcludeKeywords = excludeKeywords;
  } catch {
    // TMDB not configured
  }

  try {
    const [firstPage, discoverResults] = await Promise.all([
      discoverTv({ ...filters, page: "1" }),
      discoverTvMultiPage(filters, DISCOVER_INITIAL_PAGES),
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
          title="Discover TV Shows"
          mediaType="tv"
          initialItems={enriched}
          filterParams={params}
          initialPagesLoaded={DISCOVER_INITIAL_PAGES}
          totalPages={totalPages}
          filters={
            <Suspense>
              <DiscoverFilters
                genres={genres}
                mediaType="tv"
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
