import type { MediaType } from "@/types";

const RT_ALGOLIA_URL = "https://79frdp12pn-dsn.algolia.net/1/indexes/*/queries";

interface RTAlgoliaHit {
  title: string;
  titles?: string[];
  aka?: string[];
  releaseYear: number;
  vanity: string;
  rottenTomatoes?: {
    criticsScore: number;
    audienceScore: number;
    certifiedFresh: boolean;
  };
}

interface RTAlgoliaSearchResponse {
  results: Array<{
    hits: RTAlgoliaHit[];
    index: string;
  }>;
}

export interface RTRatings {
  criticsScore: number;
  audienceScore?: number;
  criticsRating: "Certified Fresh" | "Fresh" | "Rotten";
  url: string;
}

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").trim();
}

function scoreHit(hit: RTAlgoliaHit, name: string, year?: number): number {
  const normalizedName = normalizeTitle(name);
  const candidates = [hit.title, ...(hit.aka ?? []), ...(hit.titles ?? [])];
  let titleScore = 0;

  for (let index = 0; index < candidates.length; index++) {
    const candidate = normalizeTitle(candidates[index]);
    const alternatePenalty = index === 0 ? 1 : 0.8;

    if (candidate === normalizedName) {
      titleScore = Math.max(titleScore, alternatePenalty);
    } else if (candidate.includes(normalizedName) || normalizedName.includes(candidate)) {
      titleScore = Math.max(titleScore, alternatePenalty * 0.25);
    }
  }

  const yearScore = year
    ? Math.max(0, 1 - Math.abs(hit.releaseYear - year) * 0.4)
    : 1;
  const ratingsScore = hit.rottenTomatoes ? 1 : 0.5;

  return titleScore * yearScore * ratingsScore;
}

function pickBestHit(hits: RTAlgoliaHit[], name: string, year?: number): RTAlgoliaHit | null {
  const MINIMUM_SCORE = 0.175;
  const ranked = hits
    .map((hit) => ({ hit, score: scoreHit(hit, name, year) }))
    .filter(({ score }) => score > MINIMUM_SCORE)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.hit ?? null;
}

function toRatings(hit: RTAlgoliaHit, mediaType: MediaType): RTRatings {
  const rt = hit.rottenTomatoes!;
  const criticsRating =
    mediaType === "movie" && rt.certifiedFresh
      ? "Certified Fresh"
      : rt.criticsScore >= 60
        ? "Fresh"
        : "Rotten";

  return {
    criticsScore: rt.criticsScore,
    audienceScore: rt.audienceScore,
    criticsRating,
    url: `https://www.rottentomatoes.com/${mediaType === "movie" ? "m" : "tv"}/${hit.vanity}`,
  };
}

async function searchRottenTomatoes(
  mediaType: MediaType,
  name: string
): Promise<RTAlgoliaHit[]> {
  const typeFilter = mediaType === "movie" ? 'type:"movie"' : 'type:"tv"';
  const filters = encodeURIComponent(`isEmsSearchable=1 AND ${typeFilter}`);
  const query = mediaType === "movie" ? name.replace(/\bthe\b ?/gi, "") : name;

  const res = await fetch(RT_ALGOLIA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-algolia-agent": "Algolia for JavaScript (4.14.3); Browser (lite)",
      "x-algolia-api-key": "175588f6e5f8319b27702e4cc4013561",
      "x-algolia-application-id": "79FRDP12PN",
    },
    body: JSON.stringify({
      requests: [
        {
          indexName: "content_rt",
          query,
          params: `filters=${filters}&hitsPerPage=20`,
        },
      ],
    }),
    next: { revalidate: 3600 },
  });

  if (!res.ok) return [];

  const data = (await res.json()) as RTAlgoliaSearchResponse;
  return data.results.find((result) => result.index === "content_rt")?.hits ?? [];
}

export async function getRottenTomatoesRatings(
  mediaType: MediaType,
  name: string,
  year?: number
): Promise<RTRatings | null> {
  try {
    const hits = await searchRottenTomatoes(mediaType, name);
    const match = pickBestHit(hits, name, year);
    if (!match?.rottenTomatoes) return null;
    return toRatings(match, mediaType);
  } catch {
    return null;
  }
}
