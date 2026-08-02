import type { TmdbMediaItem } from "@/types";
import {
  FOR_YOU_PERSONAL_SCORE_WEIGHT,
  FOR_YOU_QUALITY_SCORE_WEIGHT,
} from "./constants";

export type CandidateRtRatings = {
  rtCritics?: number;
  rtAudience?: number;
};

export function tmdbQualityPercent(voteAverage?: number): number {
  if (voteAverage == null || voteAverage <= 0) return 50;
  return Math.max(0, Math.min(100, Math.round(voteAverage * 10)));
}

export function rtQualityPercent(criticsScore?: number, audienceScore?: number): number | null {
  if (criticsScore == null && audienceScore == null) return null;
  if (criticsScore != null && audienceScore != null) {
    return Math.round(criticsScore * 0.6 + audienceScore * 0.4);
  }
  return criticsScore ?? audienceScore ?? null;
}

export function combinedQualityPercent(tmdbPercent: number, rtPercent: number | null): number {
  if (rtPercent != null) {
    return Math.round(tmdbPercent * 0.45 + rtPercent * 0.55);
  }
  return tmdbPercent;
}

export function qualityPercentForItem(
  item: TmdbMediaItem,
  rtMap: Map<number, CandidateRtRatings>
): number {
  const tmdb = tmdbQualityPercent(item.vote_average);
  const rt = rtMap.get(item.id);
  const rtPct = rt ? rtQualityPercent(rt.rtCritics, rt.rtAudience) : null;
  const reviewQuality = combinedQualityPercent(tmdb, rtPct);

  let popularityQuality = 50;
  if (item.popularity != null && item.popularity > 0) {
    popularityQuality += Math.min(35, Math.log10(item.popularity + 1) * 14);
  }
  if (item.vote_count != null && item.vote_count >= 100) {
    popularityQuality += Math.min(15, Math.log10(item.vote_count) * 5);
  }
  popularityQuality = Math.max(0, Math.min(100, Math.round(popularityQuality)));

  return Math.round(reviewQuality * 0.7 + popularityQuality * 0.3);
}

export function blendPersonalAndQuality(personalScore: number, qualityScore: number): number {
  const blended =
    personalScore * FOR_YOU_PERSONAL_SCORE_WEIGHT +
    qualityScore * FOR_YOU_QUALITY_SCORE_WEIGHT;
  return Math.max(0, Math.min(100, Math.round(blended)));
}
