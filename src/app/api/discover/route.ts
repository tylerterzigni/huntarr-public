import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  discoverMovies,
  discoverTv,
  discoverMoviesPageRange,
  discoverTvPageRange,
} from "@/lib/integrations/tmdb/client";
import { buildMovieDiscoverFilters, buildTvDiscoverFilters } from "@/lib/discover/build-filters";
import { enrichWithStatus, withoutHiddenItems } from "@/lib/recommendations/filters";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  if (type !== "movie" && type !== "tv") {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const params = Object.fromEntries(
    [...searchParams.entries()].filter(([key]) => !["type", "page", "pages", "startPage"].includes(key))
  );
  const filters = type === "movie" ? buildMovieDiscoverFilters(params) : buildTvDiscoverFilters(params);
  const pages = searchParams.get("pages");
  const page = searchParams.get("page") ?? "1";

  try {
    if (pages) {
      const pageCount = Math.min(Math.max(Number(pages) || 5, 1), 10);
      const startPage = Math.max(Number(searchParams.get("startPage")) || 1, 1);
      const ranged =
        type === "movie"
          ? await discoverMoviesPageRange(filters, startPage, pageCount)
          : await discoverTvPageRange(filters, startPage, pageCount);
      const enriched = withoutHiddenItems(
        await enrichWithStatus(ranged.results, session.user.id)
      );
      const loadedThrough = Math.min(startPage + pageCount - 1, ranged.total_pages);

      return NextResponse.json({
        results: enriched,
        count: enriched.length,
        total_pages: ranged.total_pages,
        page: loadedThrough,
        startPage,
      });
    }

    const discover =
      type === "movie"
        ? await discoverMovies({ ...filters, page })
        : await discoverTv({ ...filters, page });
    const enriched = withoutHiddenItems(
      await enrichWithStatus(discover.results, session.user.id)
    );

    return NextResponse.json({
      results: enriched,
      count: enriched.length,
      total_pages: discover.total_pages,
      page: Number(page),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load discover results" },
      { status: 500 }
    );
  }
}
