import type { DecryptedInstance } from "@/lib/settings/integrations";
import type { PlexCredentials, TautulliCredentials } from "@/types";
import { fetchPlexGuidsByRatingKeys } from "@/lib/integrations/plex/client";
import { resolveTmdbFromGuidList } from "@/lib/integrations/guid-to-tmdb";
import { getTvDetails, searchMulti } from "@/lib/integrations/tmdb/client";
import { pickBestMediaMatch } from "@/lib/search/rank-search-results";
import type { TautulliHistoryItem } from "@/lib/integrations/tautulli/client";

function normalizeGuidList(raw: unknown): string[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (typeof entry === "string") return entry ? [entry] : [];
    if (entry && typeof entry === "object" && "id" in entry && entry.id) {
      return [String(entry.id)];
    }
    return [];
  });
}

function showRatingKeyFromEpisode(item: TautulliHistoryItem): string | null {
  if (item.media_type !== "episode") return null;
  return item.grandparent_rating_key ?? item.rating_key ?? null;
}

function episodesForShow(items: TautulliHistoryItem[], showRatingKey: string) {
  return items.filter((item) => showRatingKeyFromEpisode(item) === showRatingKey);
}

async function tautulliShowMetadata(
  instance: DecryptedInstance<TautulliCredentials>,
  showRatingKey: string
): Promise<Record<string, unknown> | null> {
  const url = new URL(`${instance.baseUrl.replace(/\/$/, "")}/api/v2`);
  url.searchParams.set("apikey", instance.credentials.apiKey);
  url.searchParams.set("cmd", "get_metadata");
  url.searchParams.set("rating_key", showRatingKey);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    if (data.response?.result !== "success") return null;
    return (data.response.data ?? null) as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

function readLeafCount(meta: Record<string, unknown> | null): number | undefined {
  const value = meta?.leaf_count;
  if (typeof value === "number" && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

/** Resolve a TV show TMDB id from Tautulli episode history when GUID mapping fails. */
export async function resolveTvShowFromHistory(
  instance: DecryptedInstance<TautulliCredentials>,
  showRatingKey: string,
  items: TautulliHistoryItem[],
  plexInstance?: DecryptedInstance<PlexCredentials> | null
): Promise<{ tmdbId: number; title: string } | null> {
  const episodes = episodesForShow(items, showRatingKey);
  if (episodes.length === 0) return null;

  const title = episodes[0].grandparent_title?.trim() ?? episodes[0].title?.trim() ?? "";
  const guids = new Set<string>();

  const meta = await tautulliShowMetadata(instance, showRatingKey);
  if (meta?.guid && typeof meta.guid === "string") guids.add(meta.guid);
  for (const guid of normalizeGuidList(meta?.guids)) guids.add(guid);
  for (const episode of episodes) {
    if (episode.guid) guids.add(episode.guid);
  }

  if (plexInstance) {
    try {
      const plexGuids = await fetchPlexGuidsByRatingKeys(plexInstance, [showRatingKey]);
      for (const guid of plexGuids.get(showRatingKey) ?? []) guids.add(guid);
    } catch {
      // optional
    }
  }

  const resolved = await resolveTmdbFromGuidList([...guids], { mediaType: "episode" });
  if (resolved?.mediaType === "tv") {
    return { tmdbId: resolved.tmdbId, title: title || String(meta?.title ?? "") };
  }

  if (!title) return null;

  const search = await searchMulti(title, 1);
  const tvResults = search.results.filter((result) => result.media_type === "tv");
  const match = pickBestMediaMatch(title, tvResults);
  if (match) {
    return { tmdbId: match.id, title: match.name ?? title };
  }

  return null;
}

async function resolveShowLeafCount(
  instance: DecryptedInstance<TautulliCredentials>,
  showRatingKey: string,
  items: TautulliHistoryItem[],
  plexLeafCounts: Map<string, number> | undefined,
  plexInstance?: DecryptedInstance<PlexCredentials> | null
): Promise<number | undefined> {
  const meta = await tautulliShowMetadata(instance, showRatingKey);
  const tautulliLeaf = readLeafCount(meta);
  if (tautulliLeaf) return tautulliLeaf;

  const plexLeaf = plexLeafCounts?.get(showRatingKey);
  if (plexLeaf && plexLeaf > 0) return plexLeaf;

  const resolved = await resolveTvShowFromHistory(instance, showRatingKey, items, plexInstance);
  if (!resolved) return undefined;

  try {
    const details = await getTvDetails(resolved.tmdbId);
    const episodes = details.number_of_episodes;
    if (typeof episodes === "number" && episodes > 0) return episodes;
  } catch {
    return undefined;
  }

  return undefined;
}

export async function buildFullyWatchedTvUpserts(
  instance: DecryptedInstance<TautulliCredentials>,
  items: TautulliHistoryItem[],
  userId: number,
  username: string,
  getShowWatchedEpisodeKeysFn: (
    instance: DecryptedInstance<TautulliCredentials>,
    userId: number,
    showRatingKey: string
  ) => Promise<Set<string>>,
  plexLeafCounts?: Map<string, number>,
  plexWatchProgress?: Map<string, { leafCount: number; viewedLeafCount: number }>,
  plexInstance?: DecryptedInstance<PlexCredentials> | null
): Promise<
  Array<{
    tautulliUsername: string;
    tmdbId: number;
    mediaType: "tv";
    title: string;
    ratingKey: string;
    fullyWatched: boolean;
  }>
> {
  const showRatingKeys = new Set<string>();
  for (const item of items) {
    const key = showRatingKeyFromEpisode(item);
    if (key) showRatingKeys.add(key);
  }

  const upserts: Array<{
    tautulliUsername: string;
    tmdbId: number;
    mediaType: "tv";
    title: string;
    ratingKey: string;
    fullyWatched: boolean;
  }> = [];

  for (const showRatingKey of showRatingKeys) {
    const plexProgress = plexWatchProgress?.get(showRatingKey);
    let fullyWatched =
      !!plexProgress &&
      plexProgress.leafCount > 0 &&
      plexProgress.viewedLeafCount >= plexProgress.leafCount;

    if (!fullyWatched) {
      const leafCount = await resolveShowLeafCount(
        instance,
        showRatingKey,
        items,
        plexLeafCounts,
        plexInstance
      );
      if (!leafCount) continue;

      const watchedKeys = await getShowWatchedEpisodeKeysFn(instance, userId, showRatingKey);
      fullyWatched = watchedKeys.size >= leafCount;
    }

    if (!fullyWatched) continue;

    const resolved = await resolveTvShowFromHistory(instance, showRatingKey, items, plexInstance);
    if (!resolved) continue;

    upserts.push({
      tautulliUsername: username,
      tmdbId: resolved.tmdbId,
      mediaType: "tv",
      title: resolved.title,
      ratingKey: showRatingKey,
      fullyWatched: true,
    });
  }

  return upserts;
}
