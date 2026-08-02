import type { DecryptedInstance } from "@/lib/settings/integrations";
import type { PlexCredentials, TautulliCredentials } from "@/types";
import { fetchPlexGuidsByRatingKeys } from "@/lib/integrations/plex/client";
import { getMediaItemBrief } from "@/lib/integrations/tmdb/client";
import { getMediaTitle } from "@/lib/integrations/tmdb/helpers";
import {
  resolveTmdbFromGuidList,
  type ResolvedTmdb,
} from "@/lib/integrations/guid-to-tmdb";

const METADATA_CONCURRENCY = 16;
const RESOLVE_CONCURRENCY = 24;

async function tautulliFetch<T>(
  instance: DecryptedInstance<TautulliCredentials>,
  cmd: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const url = new URL(`${instance.baseUrl.replace(/\/$/, "")}/api/v2`);
  url.searchParams.set("apikey", instance.credentials.apiKey);
  url.searchParams.set("cmd", cmd);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Tautulli error: ${res.status}`);
  const data = await res.json();
  if (data.response?.result !== "success") {
    throw new Error(data.response?.message ?? "Tautulli request failed");
  }
  return data.response.data as T;
}

async function runPool<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) break;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

export async function testTautulliConnection(instance: DecryptedInstance<TautulliCredentials>) {
  await tautulliFetch(instance, "get_server_info");
  return true;
}

export interface TautulliUser {
  user_id: number;
  username: string;
  friendly_name: string;
}

export async function getTautulliUsers(instance: DecryptedInstance<TautulliCredentials>) {
  const data = await tautulliFetch<TautulliUser[] | Record<string, TautulliUser>>(
    instance,
    "get_users"
  );
  const list = Array.isArray(data) ? data : Object.values(data ?? {});
  return list.filter((u) => u.user_id !== 0);
}

/** Match a Tautulli display name to a user; history API filters by user_id. */
export async function resolveTautulliUser(
  instance: DecryptedInstance<TautulliCredentials>,
  query: string
): Promise<TautulliUser> {
  const users = await getTautulliUsers(instance);
  const q = query.trim().toLowerCase();

  const match = users.find(
    (u) =>
      u.username?.toLowerCase() === q ||
      u.friendly_name?.toLowerCase() === q ||
      u.friendly_name?.toLowerCase().includes(q)
  );

  if (!match) {
    const available = users.map((u) => u.friendly_name || u.username).join(", ");
    throw new Error(
      `No Tautulli user matching "${query}". Use Tautulli display names (e.g. Alice, Bob). Available: ${available || "none"}`
    );
  }

  return match;
}

export interface TautulliHistoryItem {
  title: string;
  full_title?: string;
  media_type: string;
  rating_key: string;
  grandparent_rating_key?: string;
  date: number;
  user: string;
  guid?: string;
  grandparent_title?: string;
  watched_status?: number;
}

interface HistoryResponse {
  data: TautulliHistoryItem[];
  recordsFiltered: number;
}

function isHistoryItemWatched(item: TautulliHistoryItem): boolean {
  return item.watched_status === undefined || item.watched_status === 1;
}

function showProgressKey(username: string, showRatingKey: string): string {
  return `${username}|${showRatingKey}`;
}

export async function getWatchHistory(
  instance: DecryptedInstance<TautulliCredentials>,
  userId: number,
  length = 500
) {
  return tautulliFetch<HistoryResponse>(instance, "get_history", {
    user_id: userId,
    length,
    order_column: "date",
    order_dir: "desc",
  });
}

/** Paginate through Tautulli watch history (newest first). */
export async function getAllWatchHistory(
  instance: DecryptedInstance<TautulliCredentials>,
  userId: number,
  pageSize = 1000,
  maxRecords = 25000
): Promise<TautulliHistoryItem[]> {
  const all: TautulliHistoryItem[] = [];
  let start = 0;

  while (all.length < maxRecords) {
    const batch = await tautulliFetch<HistoryResponse>(instance, "get_history", {
      user_id: userId,
      length: Math.min(pageSize, maxRecords - all.length),
      start,
      order_column: "date",
      order_dir: "desc",
    });
    const rows = batch.data ?? [];
    if (rows.length === 0) break;
    all.push(...rows);
    if (rows.length < pageSize) break;
    start += rows.length;
  }

  return all;
}

export async function getShowWatchedEpisodeKeys(
  instance: DecryptedInstance<TautulliCredentials>,
  userId: number,
  grandparentRatingKey: string
): Promise<Set<string>> {
  const watched = new Set<string>();
  let start = 0;
  const pageSize = 500;

  while (true) {
    const batch = await tautulliFetch<HistoryResponse>(instance, "get_history", {
      user_id: userId,
      grandparent_rating_key: grandparentRatingKey,
      media_type: "episode",
      length: pageSize,
      start,
    });
    const rows = batch.data ?? [];
    for (const row of rows) {
      if (isHistoryItemWatched(row)) watched.add(row.rating_key);
    }
    if (rows.length < pageSize) break;
    start += rows.length;
  }

  return watched;
}

interface TautulliMetadata {
  guid?: string;
  guids?: string[] | Array<{ id?: string }>;
  grandparent_guid?: string;
  grandparent_guids?: string[] | Array<{ id?: string }>;
  media_type?: string;
  leaf_count?: number;
}

const metadataCache = new Map<string, TautulliMetadata>();

async function getTautulliMetadata(
  instance: DecryptedInstance<TautulliCredentials>,
  ratingKey: string
): Promise<TautulliMetadata | null> {
  if (metadataCache.has(ratingKey)) return metadataCache.get(ratingKey)!;

  try {
    const meta = await tautulliFetch<TautulliMetadata>(instance, "get_metadata", {
      rating_key: ratingKey,
    });
    metadataCache.set(ratingKey, meta);
    return meta;
  } catch {
    metadataCache.set(ratingKey, {});
    return null;
  }
}

async function prefetchTautulliMetadata(
  instance: DecryptedInstance<TautulliCredentials>,
  ratingKeys: string[]
) {
  const unique = [...new Set(ratingKeys.filter(Boolean))].filter((key) => !metadataCache.has(key));
  await runPool(unique, (key) => getTautulliMetadata(instance, key), METADATA_CONCURRENCY);
}

export function clearTautulliMetadataCache() {
  metadataCache.clear();
}

function normalizeGuidList(raw: TautulliMetadata["guids"]): string[] {
  if (!raw || !Array.isArray(raw)) return [];

  return raw.flatMap((entry) => {
    if (typeof entry === "string") return entry ? [entry] : [];
    if (entry && typeof entry === "object" && entry.id) return [String(entry.id)];
    return [];
  });
}

function collectMetadataGuids(meta: TautulliMetadata, forEpisode: boolean): string[] {
  const guids: string[] = [];

  if (forEpisode) {
    guids.push(...normalizeGuidList(meta.grandparent_guids));
    if (meta.grandparent_guid) guids.push(meta.grandparent_guid);
  }

  guids.push(...normalizeGuidList(meta.guids));
  if (meta.guid) guids.push(meta.guid);

  return guids;
}

function isWatchableMediaType(mediaType: string): mediaType is "movie" | "episode" {
  return mediaType === "movie" || mediaType === "episode";
}

function acceptResolved(
  itemType: "movie" | "episode",
  resolved: ResolvedTmdb
): ResolvedTmdb | null {
  if (itemType === "movie") {
    return resolved.mediaType === "movie" ? resolved : null;
  }
  return resolved.mediaType === "tv" ? resolved : null;
}

interface UniqueWatch {
  itemType: "movie" | "episode";
  contentKey: string;
  ratingKey: string;
  plexLookupKey: string;
  title: string;
  watchedAt: Date;
  username: string;
  sampleGuid?: string;
  metadataKeys: string[];
}

function groupWatchableItems(items: TautulliHistoryItem[]): UniqueWatch[] {
  const groups = new Map<string, UniqueWatch>();

  for (const item of items) {
    if (!isWatchableMediaType(item.media_type)) continue;

    const isEpisode = item.media_type === "episode";
    const lookupKey = isEpisode
      ? (item.grandparent_rating_key ?? item.rating_key)
      : item.rating_key;
    const contentKey = `${item.user}:${item.media_type}:${lookupKey}`;
    const watchedAt = new Date(item.date * 1000);
    const existing = groups.get(contentKey);

    if (!existing || watchedAt > existing.watchedAt) {
      groups.set(contentKey, {
        itemType: item.media_type,
        contentKey,
        ratingKey: lookupKey,
        plexLookupKey: lookupKey,
        title: item.grandparent_title ?? item.full_title ?? item.title,
        watchedAt,
        username: item.user,
        sampleGuid: item.guid,
        metadataKeys: isEpisode
          ? [item.grandparent_rating_key, item.rating_key].filter((key): key is string => !!key)
          : [item.rating_key].filter(Boolean),
      });
    }
  }

  return [...groups.values()];
}

function guidCandidatesForWatch(
  watch: UniqueWatch,
  plexGuids: Map<string, string[]>,
  tautulliMeta: Map<string, TautulliMetadata>,
  includeMetadata: boolean
): string[] {
  const guidCandidates: string[] = [];
  if (watch.sampleGuid) guidCandidates.push(watch.sampleGuid);

  const plex = plexGuids.get(watch.plexLookupKey);
  if (plex) guidCandidates.push(...plex);

  if (!includeMetadata) {
    return [...new Set(guidCandidates.filter(Boolean))];
  }

  if (watch.itemType === "episode") {
    const showMeta = tautulliMeta.get(watch.ratingKey);
    if (showMeta) guidCandidates.push(...collectMetadataGuids(showMeta, false));

    for (const key of watch.metadataKeys) {
      if (key === watch.ratingKey) continue;
      const episodeMeta = tautulliMeta.get(key);
      if (episodeMeta) guidCandidates.push(...collectMetadataGuids(episodeMeta, true));
    }
  } else {
    const movieMeta = tautulliMeta.get(watch.ratingKey);
    if (movieMeta) guidCandidates.push(...collectMetadataGuids(movieMeta, false));
  }

  return [...new Set(guidCandidates.filter(Boolean))];
}

async function resolveUniqueWatch(
  watch: UniqueWatch,
  plexGuids: Map<string, string[]>,
  tautulliMeta: Map<string, TautulliMetadata>,
  includeMetadata: boolean
) {
  const hint = watch.itemType === "movie" ? "movie" : "episode";
  const guids = guidCandidatesForWatch(watch, plexGuids, tautulliMeta, includeMetadata);
  const resolved = await resolveTmdbFromGuidList(guids, { mediaType: hint });
  if (!resolved) return null;
  return acceptResolved(watch.itemType, resolved);
}

function plexRatingKeysForHistory(items: TautulliHistoryItem[]): string[] {
  const keys = new Set<string>();

  for (const item of items) {
    if (item.media_type === "episode" && item.grandparent_rating_key) {
      keys.add(item.grandparent_rating_key);
    } else if (item.media_type === "movie" && item.rating_key) {
      keys.add(item.rating_key);
    }
  }

  return [...keys];
}

export async function mapHistoryToTmdb(
  instance: DecryptedInstance<TautulliCredentials>,
  items: TautulliHistoryItem[],
  plexInstance?: DecryptedInstance<PlexCredentials> | null
) {
  clearTautulliMetadataCache();

  const uniqueWatches = groupWatchableItems(items);
  if (uniqueWatches.length === 0) return [];

  let plexGuids = new Map<string, string[]>();
  if (plexInstance) {
    try {
      plexGuids = await fetchPlexGuidsByRatingKeys(
        plexInstance,
        plexRatingKeysForHistory(items)
      );
    } catch {
      // Plex enrichment is optional.
    }
  }

  const tautulliMeta = new Map<string, TautulliMetadata>();
  for (const [key, meta] of metadataCache.entries()) {
    tautulliMeta.set(key, meta);
  }

  const quickResolved = await runPool(
    uniqueWatches,
    (watch) => resolveUniqueWatch(watch, plexGuids, tautulliMeta, false),
    RESOLVE_CONCURRENCY
  );

  const unresolved = uniqueWatches.filter((_, index) => !quickResolved[index]);
  if (unresolved.length > 0) {
    const metadataKeys = unresolved.flatMap((watch) => watch.metadataKeys);
    await prefetchTautulliMetadata(instance, metadataKeys);
    for (const [key, meta] of metadataCache.entries()) {
      tautulliMeta.set(key, meta);
    }

    const slowResolved = await runPool(
      unresolved,
      (watch) => resolveUniqueWatch(watch, plexGuids, tautulliMeta, true),
      RESOLVE_CONCURRENCY
    );

    let slowIndex = 0;
    for (let i = 0; i < uniqueWatches.length; i++) {
      if (!quickResolved[i]) {
        quickResolved[i] = slowResolved[slowIndex++];
      }
    }
  }

  const mapped: Array<{
    tmdbId: number;
    mediaType: "movie" | "tv";
    title: string;
    watchedAt: Date;
    ratingKey: string;
    username: string;
  }> = [];

  const seen = new Set<string>();

  for (let i = 0; i < uniqueWatches.length; i++) {
    const watch = uniqueWatches[i];
    const parsed = quickResolved[i];
    if (!parsed) continue;

    const dedupeKey = `${watch.username}:${parsed.mediaType}:${parsed.tmdbId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    mapped.push({
      tmdbId: parsed.tmdbId,
      mediaType: parsed.mediaType,
      title: watch.title,
      watchedAt: watch.watchedAt,
      ratingKey: watch.ratingKey,
      username: watch.username,
    });
  }

  const titleCache = new Map<string, string>();
  await runPool(
    mapped.filter((item) => !item.title?.trim()),
    async (item) => {
      const cacheKey = `${item.mediaType}:${item.tmdbId}`;
      const brief = await getMediaItemBrief(item.mediaType, item.tmdbId);
      const title = brief ? getMediaTitle(brief).trim() : "";
      if (title) titleCache.set(cacheKey, title);
    },
    RESOLVE_CONCURRENCY
  );

  for (const item of mapped) {
    if (item.title?.trim()) continue;
    const cacheKey = `${item.mediaType}:${item.tmdbId}`;
    const title = titleCache.get(cacheKey);
    if (title) item.title = title;
  }

  return mapped;
}

/** Per user + Plex show rating key, whether every available episode has been watched. */
export async function computeFullyWatchedByShow(
  instance: DecryptedInstance<TautulliCredentials>,
  items: TautulliHistoryItem[],
  userId: number,
  plexLeafCounts?: Map<string, number>,
  plexWatchProgress?: Map<string, { leafCount: number; viewedLeafCount: number }>,
  username?: string
): Promise<Map<string, boolean>> {
  const showRatingKeys = new Set<string>();

  for (const item of items) {
    if (item.media_type !== "episode") continue;
    const showRatingKey = item.grandparent_rating_key ?? item.rating_key;
    if (showRatingKey) showRatingKeys.add(showRatingKey);
  }

  if (plexWatchProgress) {
    for (const [ratingKey, progress] of plexWatchProgress) {
      if (progress.leafCount > 0 && progress.viewedLeafCount >= progress.leafCount) {
        showRatingKeys.add(ratingKey);
      }
    }
  }

  if (showRatingKeys.size === 0) return new Map();

  await prefetchTautulliMetadata(instance, [...showRatingKeys]);

  const resolvedUsername = username ?? items.find((item) => item.user)?.user ?? "";
  const checks = await runPool(
    [...showRatingKeys],
    async (showRatingKey) => {
      const progressKey = showProgressKey(resolvedUsername, showRatingKey);

      const plexProgress = plexWatchProgress?.get(showRatingKey);
      if (
        plexProgress &&
        plexProgress.leafCount > 0 &&
        plexProgress.viewedLeafCount >= plexProgress.leafCount
      ) {
        return { progressKey, fullyWatched: true as const };
      }

      const meta = metadataCache.get(showRatingKey);
      let leafCount = meta?.leaf_count;
      if (leafCount == null || leafCount <= 0) {
        leafCount = plexLeafCounts?.get(showRatingKey);
      }
      if (leafCount == null || leafCount <= 0) {
        return { progressKey, fullyWatched: false as const };
      }

      const watchedKeys = await getShowWatchedEpisodeKeys(instance, userId, showRatingKey);
      return { progressKey, fullyWatched: watchedKeys.size >= leafCount };
    },
    4
  );

  const result = new Map<string, boolean>();
  for (const check of checks) {
    if (check.fullyWatched) result.set(check.progressKey, true);
  }
  return result;
}
