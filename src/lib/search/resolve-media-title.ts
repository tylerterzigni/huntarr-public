import { findOmdbByTitle } from "@/lib/integrations/omdb/client";
import {
  findByImdbId,
  searchMovie,
  searchMultiMultiPage,
  searchTv,
} from "@/lib/integrations/tmdb/client";
import { getMediaTitle, inferMediaType } from "@/lib/integrations/tmdb/helpers";
import { pickBestMediaMatch, titleMatchScore } from "@/lib/search/rank-search-results";
import { textsLikelyMatch } from "@/lib/search/fuzzy-text-match";
import type { MediaType, TmdbMediaItem } from "@/types";

const MIN_TITLE_MATCH_SCORE = 750;

export interface ResolvedMediaTitle {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  source: "tmdb" | "imdb";
}

function titleQueryVariants(query: string): string[] {
  const trimmed = query.trim();
  const variants = new Set<string>([trimmed]);

  const withoutArticle = trimmed.replace(/^the\s+/i, "").trim();
  if (withoutArticle) variants.add(withoutArticle);

  if (!/^the\s+/i.test(trimmed) && trimmed.length > 0) {
    variants.add(`The ${trimmed}`);
  }

  const titleCase = trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  variants.add(titleCase);

  if (withoutArticle) {
    variants.add(
      withoutArticle
        .split(/\s+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ")
    );
  }

  return [...variants].filter((value) => value.length > 1);
}

function isConfidentMatch(query: string, item: TmdbMediaItem): boolean {
  const title = getMediaTitle(item);
  const score = titleMatchScore(query, title);
  if (score >= MIN_TITLE_MATCH_SCORE) return true;
  return textsLikelyMatch(query, title, { mode: "title" });
}

function pickConfidentMatch(
  query: string,
  items: TmdbMediaItem[],
  preferredType?: MediaType | "all"
): TmdbMediaItem | null {
  const mediaItems = items.filter(
    (item) => inferMediaType(item) === "movie" || inferMediaType(item) === "tv"
  );

  const filtered =
    preferredType === "movie" || preferredType === "tv"
      ? mediaItems.filter((item) => inferMediaType(item) === preferredType)
      : mediaItems;

  const pool = filtered.length > 0 ? filtered : mediaItems;
  const match = pickBestMediaMatch(query, pool);
  if (!match || !isConfidentMatch(query, match)) return null;
  return match;
}

async function searchTmdbCandidates(
  query: string,
  preferredType?: MediaType | "all"
): Promise<TmdbMediaItem[]> {
  const seen = new Set<number>();
  const results: TmdbMediaItem[] = [];

  const addItems = (items: TmdbMediaItem[]) => {
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      results.push(item);
    }
  };

  for (const variant of titleQueryVariants(query)) {
    addItems(await searchMultiMultiPage(variant, 2));

    if (preferredType !== "movie") {
      const tv = await searchTv(variant);
      addItems(tv.results.map((item) => ({ ...item, media_type: "tv" as const })));
    }
    if (preferredType !== "tv") {
      const movie = await searchMovie(variant);
      addItems(movie.results.map((item) => ({ ...item, media_type: "movie" as const })));
    }
  }

  return results;
}

async function resolveViaTmdb(
  query: string,
  preferredType?: MediaType | "all"
): Promise<ResolvedMediaTitle | null> {
  const candidates = await searchTmdbCandidates(query, preferredType);
  const match = pickConfidentMatch(query, candidates, preferredType);
  if (!match) return null;

  return {
    tmdbId: match.id,
    mediaType: inferMediaType(match),
    title: getMediaTitle(match),
    source: "tmdb",
  };
}

async function resolveViaImdb(
  query: string,
  preferredType?: MediaType | "all"
): Promise<ResolvedMediaTitle | null> {
  const omdbType = preferredType === "movie" ? "movie" : preferredType === "tv" ? "series" : undefined;

  for (const variant of titleQueryVariants(query)) {
    const omdb = await findOmdbByTitle(variant, omdbType);
    if (!omdb) continue;

    const found = await findByImdbId(omdb.imdbId);
    const tvMatch = found.tv_results[0];
    const movieMatch = found.movie_results[0];

    let item: TmdbMediaItem | undefined;
    if (preferredType === "tv") item = tvMatch ?? undefined;
    else if (preferredType === "movie") item = movieMatch ?? undefined;
    else item = tvMatch ?? movieMatch;

    if (!item) continue;

    const title = getMediaTitle(item);
    if (!isConfidentMatch(query, item) && !textsLikelyMatch(variant, title, { mode: "title" })) {
      continue;
    }

    return {
      tmdbId: item.id,
      mediaType: inferMediaType(item),
      title,
      source: "imdb",
    };
  }

  return null;
}

export async function resolveMediaTitle(
  query: string,
  preferredType?: MediaType | "all"
): Promise<ResolvedMediaTitle | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const tmdbMatch = await resolveViaTmdb(trimmed, preferredType);
  if (tmdbMatch) return tmdbMatch;

  return resolveViaImdb(trimmed, preferredType);
}
