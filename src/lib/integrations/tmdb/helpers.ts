import type { MediaType, TmdbMediaItem } from "@/types";

export function getMediaTitle(item: TmdbMediaItem) {
  return item.title ?? item.name ?? "Unknown";
}

export function getMediaDate(item: TmdbMediaItem) {
  return item.release_date ?? item.first_air_date ?? null;
}

export function inferMediaType(item: TmdbMediaItem): MediaType {
  if (item.media_type === "movie" || item.media_type === "tv") return item.media_type;
  return item.title ? "movie" : "tv";
}

export function mediaItemKey(item: TmdbMediaItem): string {
  return `${inferMediaType(item)}:${item.id}`;
}
