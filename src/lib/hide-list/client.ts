import type { MediaType } from "@/types";

export const HUNTARR_TITLE_HIDDEN_EVENT = "huntarr:title-hidden";

export type TitleHiddenDetail = {
  tmdbId: number;
  mediaType: MediaType;
};

export function titleHiddenKey(tmdbId: number, mediaType: MediaType): string {
  return `${mediaType}:${tmdbId}`;
}

export function dispatchTitleHidden(detail: TitleHiddenDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(HUNTARR_TITLE_HIDDEN_EVENT, { detail }));
}

export function matchesHiddenTitle(
  item: { id: number; media_type?: string; title?: string; name?: string },
  detail: TitleHiddenDetail
): boolean {
  const mediaType =
    item.media_type === "movie" || item.media_type === "tv"
      ? item.media_type
      : item.title
        ? "movie"
        : "tv";
  return item.id === detail.tmdbId && mediaType === detail.mediaType;
}
