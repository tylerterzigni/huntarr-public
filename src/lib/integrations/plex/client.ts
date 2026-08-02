import type { DecryptedInstance } from "@/lib/settings/integrations";
import { getDefaultInstance } from "@/lib/settings/integrations";
import type { PlexCredentials } from "@/types";
import { resolveTmdbFromGuidList } from "@/lib/integrations/guid-to-tmdb";

interface PlexSection {
  key: string;
  type: string;
  title: string;
}

interface PlexMetadata {
  ratingKey: string;
  guid: string;
  title: string;
  type: string;
  year?: number;
  Guid?: { id: string } | Array<{ id: string }>;
  leafCount?: number;
  viewedLeafCount?: number;
  viewCount?: number | string;
  lastViewedAt?: number | string;
}

interface PlexConnection {
  uri: string;
  local?: boolean;
  relay?: boolean;
  protocol?: string;
}

interface PlexResource {
  name?: string;
  product?: string;
  provides?: string;
  connections?: PlexConnection[];
}

const PAGE_SIZE = 500;
const METADATA_BATCH = 50;
const PLEX_HEADERS = {
  Accept: "application/json",
  "X-Plex-Client-Identifier": "huntarr-sync",
  "X-Plex-Product": "Huntarr",
  "X-Plex-Version": "1.0",
  "X-Plex-Platform": "Docker",
};

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function isInvalidPlexServerUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "app.plex.tv" ||
      host === "plex.tv" ||
      host === "watch.plex.tv" ||
      url.includes("/desktop")
    );
  } catch {
    return true;
  }
}

function scoreConnection(conn: PlexConnection): number {
  let score = 0;
  if (conn.local) score += 10;
  if (conn.protocol === "http") score += 5;
  if (conn.relay) score -= 5;
  if (conn.uri.includes("192.168.") || conn.uri.includes("10.")) score += 8;
  if (conn.uri.includes("host.docker.internal")) score += 6;
  if (conn.uri.includes("localhost") || conn.uri.includes("127.0.0.1")) score -= 3;
  return score;
}

/** Discover local Plex Media Server URL from a Plex.tv token. */
export async function discoverPlexServerUrl(token: string): Promise<string | null> {
  const res = await fetch(
    "https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1&includeIPv6=0",
    {
      headers: { ...PLEX_HEADERS, "X-Plex-Token": token },
    }
  );
  if (!res.ok) return null;

  const resources = (await res.json()) as PlexResource[];
  const servers = resources.filter((r) => {
    const provides = r.provides ?? "";
    const hasServer =
      (typeof provides === "string" && provides.includes("server")) ||
      (Array.isArray(provides) && provides.includes("server"));
    return hasServer || r.product === "Plex Media Server";
  });

  const connections = servers.flatMap((s) => s.connections ?? []);
  if (connections.length === 0) return null;

  const sorted = [...connections].sort((a, b) => scoreConnection(b) - scoreConnection(a));
  const best = sorted[0];
  if (!best?.uri) return null;

  return normalizeBaseUrl(best.uri);
}

async function plexFetchJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: { ...PLEX_HEADERS, "X-Plex-Token": token },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Plex request failed (${res.status} ${res.statusText}): ${url}${body ? ` — ${body.slice(0, 120)}` : ""}`
    );
  }
  return res.json() as Promise<T>;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function inferLocalPlexUrl(): Promise<string | null> {
  for (const type of ["tautulli", "radarr", "sonarr"] as const) {
    const inst = await getDefaultInstance(type);
    if (!inst?.baseUrl) continue;
    try {
      const host = new URL(inst.baseUrl).hostname;
      if (host && !["localhost", "127.0.0.1"].includes(host)) {
        return `http://${host}:32400`;
      }
    } catch {
      // skip invalid URLs
    }
  }
  return null;
}

async function tryPlexBaseUrl(baseUrl: string, token: string): Promise<boolean> {
  try {
    await plexFetchJson(`${baseUrl}/library/sections`, token);
    return true;
  } catch {
    return false;
  }
}

async function resolvePlexBaseUrl(instance: DecryptedInstance<PlexCredentials>): Promise<string> {
  const candidates = [
    normalizeBaseUrl(instance.baseUrl),
    await inferLocalPlexUrl(),
    await discoverPlexServerUrl(instance.credentials.token),
  ].filter((url): url is string => !!url);

  const tried = new Set<string>();
  for (const baseUrl of candidates) {
    if (tried.has(baseUrl)) continue;
    tried.add(baseUrl);
    if (await tryPlexBaseUrl(baseUrl, instance.credentials.token)) {
      return baseUrl;
    }
  }

  throw new Error(
    isInvalidPlexServerUrl(instance.baseUrl)
      ? "Plex URL must be your Media Server address (e.g. http://192.168.x.x:32400), not app.plex.tv. Use the same IP as your Radarr/Tautulli server with port 32400."
      : `Cannot reach Plex. Tried: ${[...tried].join(", ")}. Set Base URL to http://<your-server-ip>:32400`
  );
}

export async function testPlexConnection(instance: DecryptedInstance<PlexCredentials>) {
  const baseUrl = await resolvePlexBaseUrl(instance);
  await plexFetchJson(`${baseUrl}/library/sections`, instance.credentials.token);
  return true;
}

export function buildPlexWebPlayUrl(machineIdentifier: string, ratingKey: string): string {
  const key = encodeURIComponent(`/library/metadata/${ratingKey}`);
  return `https://app.plex.tv/desktop/#!/server/${machineIdentifier}/details?key=${key}`;
}

export async function fetchPlexMachineIdentifier(
  instance: DecryptedInstance<PlexCredentials>
): Promise<string | null> {
  const baseUrl = await resolvePlexBaseUrl(instance);
  const data = await plexFetchJson<{ MediaContainer?: { machineIdentifier?: string } }>(
    `${baseUrl}/`,
    instance.credentials.token
  );
  return data.MediaContainer?.machineIdentifier ?? null;
}

async function fetchSectionMetadata(
  baseUrl: string,
  token: string,
  sectionKey: string
): Promise<PlexMetadata[]> {
  const all: PlexMetadata[] = [];
  let start = 0;

  while (true) {
    const url = `${baseUrl}/library/sections/${sectionKey}/all?X-Plex-Container-Start=${start}&X-Plex-Container-Size=${PAGE_SIZE}`;
    const data = await plexFetchJson<{ MediaContainer?: { Metadata?: PlexMetadata | PlexMetadata[] } }>(
      url,
      token
    );
    const batch = asArray(data.MediaContainer?.Metadata);
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }

  return all;
}

function guidIdsFromMetadata(meta: PlexMetadata): string[] {
  const ids = asArray(meta.Guid).map((g) => g.id).filter(Boolean);
  if (meta.guid) ids.unshift(meta.guid);
  return [...new Set(ids)];
}

async function enrichGuidCandidates(
  baseUrl: string,
  token: string,
  items: PlexMetadata[]
): Promise<Map<string, string[]>> {
  const guidMap = new Map<string, string[]>();
  const needsEnrich = items.filter((i) => !i.guid || i.guid.startsWith("plex://"));

  for (let i = 0; i < needsEnrich.length; i += METADATA_BATCH) {
    const chunk = needsEnrich.slice(i, i + METADATA_BATCH);
    const keys = chunk.map((c) => c.ratingKey).join(",");
    const data = await plexFetchJson<{ MediaContainer?: { Metadata?: PlexMetadata | PlexMetadata[] } }>(
      `${baseUrl}/library/metadata/${keys}`,
      token
    );
    for (const meta of asArray(data.MediaContainer?.Metadata)) {
      guidMap.set(meta.ratingKey, guidIdsFromMetadata(meta));
    }
  }

  for (const item of items) {
    if (!guidMap.has(item.ratingKey)) {
      guidMap.set(item.ratingKey, [item.guid].filter(Boolean));
    }
  }

  return guidMap;
}

export type PlexLibraryItem = {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  plexGuid: string;
  plexRatingKey: string;
  viewCount: number;
  lastViewedAt: Date | null;
  leafCount: number;
  viewedLeafCount: number;
};

function readPlexInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readPlexUnixDate(value: unknown): Date | null {
  const seconds = readPlexInt(value);
  if (seconds == null || seconds <= 0) return null;
  return new Date(seconds * 1000);
}

export type PlexLibraryFetchProgress = {
  sectionIndex: number;
  sectionTotal: number;
  sectionTitle: string;
  resolvedItems: number;
};

export async function fetchPlexLibrary(
  instance: DecryptedInstance<PlexCredentials>,
  onProgress?: (progress: PlexLibraryFetchProgress) => void
) {
  const baseUrl = await resolvePlexBaseUrl(instance);
  const sectionsData = await plexFetchJson<{ MediaContainer?: { Directory?: PlexSection | PlexSection[] } }>(
    `${baseUrl}/library/sections`,
    instance.credentials.token
  );

  const sections = asArray(sectionsData.MediaContainer?.Directory).filter(
    (section) => section.type === "movie" || section.type === "show"
  );
  const items: PlexLibraryItem[] = [];
  const seen = new Set<string>();

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    const section = sections[sectionIndex];
    const mediaType: "movie" | "tv" = section.type === "show" ? "tv" : "movie";
    onProgress?.({
      sectionIndex,
      sectionTotal: sections.length,
      sectionTitle: section.title ?? section.key,
      resolvedItems: items.length,
    });

    const metadata = await fetchSectionMetadata(baseUrl, instance.credentials.token, section.key);
    const guidMap = await enrichGuidCandidates(baseUrl, instance.credentials.token, metadata);

    for (const item of metadata) {
      const guidCandidates = guidMap.get(item.ratingKey) ?? [item.guid];
      const parsed = await resolveTmdbFromGuidList(guidCandidates, { mediaType });
      if (!parsed) continue;

      const dedupeKey = `${parsed.mediaType}:${parsed.tmdbId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const leafCount = readPlexInt(item.leafCount) ?? 0;
      const viewedLeafCount = readPlexInt(item.viewedLeafCount) ?? 0;
      const viewCount = readPlexInt(item.viewCount) ?? 0;

      items.push({
        tmdbId: parsed.tmdbId,
        mediaType: parsed.mediaType,
        title: item.title,
        plexGuid: item.guid,
        plexRatingKey: item.ratingKey,
        viewCount,
        lastViewedAt: readPlexUnixDate(item.lastViewedAt),
        leafCount,
        viewedLeafCount,
      });
    }
  }

  if (sections.length > 0) {
    onProgress?.({
      sectionIndex: sections.length,
      sectionTotal: sections.length,
      sectionTitle: "done",
      resolvedItems: items.length,
    });
  }

  return items;
}

export async function fetchPlexOnDeck(instance: DecryptedInstance<PlexCredentials>) {
  const baseUrl = await resolvePlexBaseUrl(instance);
  const data = await plexFetchJson<{ MediaContainer?: { Metadata?: PlexMetadata | PlexMetadata[] } }>(
    `${baseUrl}/library/onDeck`,
    instance.credentials.token
  );
  return asArray(data.MediaContainer?.Metadata);
}

/** Fetch IMDB/TVDB/TMDB agent GUIDs from Plex for history rating keys (batch). */
export async function fetchPlexGuidsByRatingKeys(
  instance: DecryptedInstance<PlexCredentials>,
  ratingKeys: string[]
): Promise<Map<string, string[]>> {
  const guidMap = new Map<string, string[]>();
  const unique = [...new Set(ratingKeys.filter(Boolean))];
  if (unique.length === 0) return guidMap;

  const baseUrl = await resolvePlexBaseUrl(instance);
  const token = instance.credentials.token;

  for (let i = 0; i < unique.length; i += METADATA_BATCH) {
    const chunk = unique.slice(i, i + METADATA_BATCH);
    const keys = chunk.join(",");
    try {
      const data = await plexFetchJson<{ MediaContainer?: { Metadata?: PlexMetadata | PlexMetadata[] } }>(
        `${baseUrl}/library/metadata/${keys}`,
        token
      );
      for (const meta of asArray(data.MediaContainer?.Metadata)) {
        guidMap.set(meta.ratingKey, guidIdsFromMetadata(meta));
      }
    } catch {
      // Skip failed batch; individual items may still resolve via Tautulli metadata.
    }
  }

  return guidMap;
}

export type PlexShowWatchProgress = {
  leafCount: number;
  viewedLeafCount: number;
};

function readPlexShowProgress(meta: PlexMetadata): PlexShowWatchProgress | null {
  const leafCount = readPlexInt(meta.leafCount);
  const viewedLeafCount = readPlexInt(meta.viewedLeafCount);
  if (leafCount == null || leafCount <= 0 || viewedLeafCount == null) return null;
  return { leafCount, viewedLeafCount };
}

/** Episode watch progress from Plex for show rating keys. */
export async function fetchPlexShowWatchProgressByRatingKeys(
  instance: DecryptedInstance<PlexCredentials>,
  ratingKeys: string[]
): Promise<Map<string, PlexShowWatchProgress>> {
  const progress = new Map<string, PlexShowWatchProgress>();
  const unique = [...new Set(ratingKeys.filter(Boolean))];
  if (unique.length === 0) return progress;

  const baseUrl = await resolvePlexBaseUrl(instance);
  const token = instance.credentials.token;

  for (let i = 0; i < unique.length; i += METADATA_BATCH) {
    const chunk = unique.slice(i, i + METADATA_BATCH);
    const keys = chunk.join(",");
    try {
      const data = await plexFetchJson<{ MediaContainer?: { Metadata?: PlexMetadata | PlexMetadata[] } }>(
        `${baseUrl}/library/metadata/${keys}`,
        token
      );
      for (const meta of asArray(data.MediaContainer?.Metadata)) {
        const showProgress = readPlexShowProgress(meta);
        if (showProgress) progress.set(meta.ratingKey, showProgress);
      }
    } catch {
      // Optional enrichment; skip failed batch.
    }
  }

  return progress;
}

export type PlexMovieWatchState = {
  viewCount: number;
  lastViewedAt: Date | null;
};

/** Movie view counts from Plex for movie rating keys. */
export async function fetchPlexMovieWatchStateByRatingKeys(
  instance: DecryptedInstance<PlexCredentials>,
  ratingKeys: string[]
): Promise<Map<string, PlexMovieWatchState>> {
  const states = new Map<string, PlexMovieWatchState>();
  const unique = [...new Set(ratingKeys.filter(Boolean))];
  if (unique.length === 0) return states;

  const baseUrl = await resolvePlexBaseUrl(instance);
  const token = instance.credentials.token;

  for (let i = 0; i < unique.length; i += METADATA_BATCH) {
    const chunk = unique.slice(i, i + METADATA_BATCH);
    const keys = chunk.join(",");
    try {
      const data = await plexFetchJson<{ MediaContainer?: { Metadata?: PlexMetadata | PlexMetadata[] } }>(
        `${baseUrl}/library/metadata/${keys}`,
        token
      );
      for (const meta of asArray(data.MediaContainer?.Metadata)) {
        states.set(meta.ratingKey, {
          viewCount: readPlexInt(meta.viewCount) ?? 0,
          lastViewedAt: readPlexUnixDate(meta.lastViewedAt),
        });
      }
    } catch {
      // Optional enrichment; skip failed batch.
    }
  }

  return states;
}

/** Fetch episode totals from Plex for show rating keys (used when Tautulli metadata lacks leaf_count). */
export async function fetchPlexShowLeafCountsByRatingKeys(
  instance: DecryptedInstance<PlexCredentials>,
  ratingKeys: string[]
): Promise<Map<string, number>> {
  const progress = await fetchPlexShowWatchProgressByRatingKeys(instance, ratingKeys);
  const leafCounts = new Map<string, number>();
  for (const [ratingKey, counts] of progress) {
    leafCounts.set(ratingKey, counts.leafCount);
  }
  return leafCounts;
}
