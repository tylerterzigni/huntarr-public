import { getRottenTomatoesRatings } from "@/lib/integrations/rottentomatoes/client";
import { getMediaDate, getMediaTitle, inferMediaType } from "@/lib/integrations/tmdb/helpers";
import { FOR_YOU_RT_FETCH_CONCURRENCY } from "./constants";
import type { CandidateRtRatings } from "./quality-score";
import type { TmdbMediaItem } from "@/types";

function releaseYear(item: TmdbMediaItem): number | undefined {
  const date = getMediaDate(item);
  if (!date) return undefined;
  const year = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(year) ? year : undefined;
}

export async function fetchCandidateRtRatings(
  items: TmdbMediaItem[]
): Promise<Map<number, CandidateRtRatings>> {
  const ratings = new Map<number, CandidateRtRatings>();
  if (items.length === 0) return ratings;

  for (let i = 0; i < items.length; i += FOR_YOU_RT_FETCH_CONCURRENCY) {
    const batch = items.slice(i, i + FOR_YOU_RT_FETCH_CONCURRENCY);
    await Promise.all(
      batch.map(async (item) => {
        const mediaType = inferMediaType(item);
        try {
          const rt = await getRottenTomatoesRatings(
            mediaType,
            getMediaTitle(item),
            releaseYear(item)
          );
          if (rt) {
            ratings.set(item.id, {
              rtCritics: rt.criticsScore,
              rtAudience: rt.audienceScore,
            });
          }
        } catch {
          // skip failed RT lookups
        }
      })
    );
  }

  return ratings;
}
