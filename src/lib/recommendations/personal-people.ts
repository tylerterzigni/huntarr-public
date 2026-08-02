import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  plexLibraryCache,
  userPreferences,
  watchHistoryCache,
} from "@/lib/db/schema";
import {
  getMovieDetails,
  getPersonDetails,
  getTvDetails,
  searchPerson,
} from "@/lib/integrations/tmdb/client";
import { listLikedMedia, listLikedPeople } from "@/lib/liked-list";
import {
  buildPersonCreditLookup,
  loadPersonCreditEntries,
  passesPersonCreditFilter,
  sortPersonSearchResults,
  type PersonCreditFilter,
} from "@/lib/recommendations/person-credits";
import { personNamesLikelyMatch, scorePersonNameMatch } from "@/lib/search/person-name-match";
import { pickBestPersonMatch } from "@/lib/search/rank-person";
import type { MediaType, TmdbCreditPerson, TmdbMediaItem, TmdbPersonSearchResult } from "@/types";

const CACHE_TTL_MS = 5 * 60 * 1000;
const WATCH_TITLE_LIMIT = 20;
const LIBRARY_TITLE_LIMIT = 15;
const LIKED_MEDIA_LIMIT = 10;

const CREW_DEPARTMENTS = new Set(["Writing", "Production", "Creator", "Directing"]);
const NOTABLE_CREW_JOBS = new Set([
  "Director",
  "Producer",
  "Executive Producer",
  "Writer",
  "Screenplay",
  "Creator",
  "Showrunner",
  "Teleplay",
]);

type PersonSource = "liked" | "watch" | "library" | "liked_media";

interface PersonalPersonEntry {
  tmdbId: number;
  name: string;
  score: number;
  sources: Set<PersonSource>;
  isCreator: boolean;
  isActor: boolean;
}

interface TitleSeed {
  mediaType: MediaType;
  tmdbId: number;
  weight: number;
  source: PersonSource;
}

const personalPeopleCache = new Map<
  string,
  { expiresAt: number; people: Map<number, PersonalPersonEntry> }
>();

function personNameMatches(query: string, candidate: string): boolean {
  return personNamesLikelyMatch(query, candidate);
}

function upsertPerson(
  map: Map<number, PersonalPersonEntry>,
  person: { id: number; name: string },
  weight: number,
  source: PersonSource,
  roles: { creator?: boolean; actor?: boolean }
) {
  if (!person.id || !person.name?.trim()) return;
  const existing = map.get(person.id);
  if (existing) {
    existing.score += weight;
    existing.sources.add(source);
    if (roles.creator) existing.isCreator = true;
    if (roles.actor) existing.isActor = true;
    return;
  }
  map.set(person.id, {
    tmdbId: person.id,
    name: person.name.trim(),
    score: weight,
    sources: new Set([source]),
    isCreator: roles.creator ?? false,
    isActor: roles.actor ?? false,
  });
}

function addCreditsFromDetails(
  map: Map<number, PersonalPersonEntry>,
  details: Record<string, unknown>,
  weight: number,
  source: PersonSource
) {
  const credits = details.credits as
    | { cast?: TmdbCreditPerson[]; crew?: TmdbCreditPerson[] }
    | undefined;

  for (const member of credits?.cast?.slice(0, 8) ?? []) {
    upsertPerson(map, member, weight, source, { actor: true });
  }

  for (const member of credits?.crew ?? []) {
    if (!NOTABLE_CREW_JOBS.has(member.job ?? "")) continue;
    upsertPerson(map, member, weight, source, { creator: true });
  }

  const createdBy = details.created_by as Array<{ id: number; name: string }> | undefined;
  for (const creator of createdBy ?? []) {
    upsertPerson(map, creator, weight + 2, source, { creator: true });
  }
}

async function extractPeopleFromTitle(
  map: Map<number, PersonalPersonEntry>,
  seed: TitleSeed
) {
  try {
    const details =
      seed.mediaType === "movie"
        ? await getMovieDetails(seed.tmdbId)
        : await getTvDetails(seed.tmdbId);
    addCreditsFromDetails(map, details, seed.weight, seed.source);
  } catch {
    // skip titles we cannot resolve
  }
}

async function gatherTitleSeeds(userId: string): Promise<TitleSeed[]> {
  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  const usernames = prefs?.tautulliUsernames ?? [];
  const history = await db.select().from(watchHistoryCache);
  const userHistory = history
    .filter((row) => usernames.includes(row.tautulliUsername))
    .sort((a, b) => (b.watchedAt?.getTime() ?? 0) - (a.watchedAt?.getTime() ?? 0));

  const seen = new Set<string>();
  const seeds: TitleSeed[] = [];

  for (const row of userHistory) {
    const key = `${row.mediaType}:${row.tmdbId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    seeds.push({
      mediaType: row.mediaType,
      tmdbId: row.tmdbId,
      weight: 8,
      source: "watch",
    });
    if (seeds.filter((s) => s.source === "watch").length >= WATCH_TITLE_LIMIT) break;
  }

  const libraryRows = await db
    .select()
    .from(plexLibraryCache)
    .where(eq(plexLibraryCache.inLibrary, true));

  for (const row of libraryRows) {
    const key = `${row.mediaType}:${row.tmdbId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    seeds.push({
      mediaType: row.mediaType,
      tmdbId: row.tmdbId,
      weight: 5,
      source: "library",
    });
    if (seeds.filter((s) => s.source === "library").length >= LIBRARY_TITLE_LIMIT) break;
  }

  const likedMedia = await listLikedMedia(userId);
  for (const item of likedMedia.slice(0, LIKED_MEDIA_LIMIT)) {
    const mediaType = item.kind as MediaType;
    const key = `${mediaType}:${item.tmdbId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    seeds.push({
      mediaType,
      tmdbId: item.tmdbId,
      weight: 7,
      source: "liked_media",
    });
  }

  return seeds;
}

export async function loadPersonalPeople(
  userId: string
): Promise<Map<number, PersonalPersonEntry>> {
  const cached = personalPeopleCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.people;
  }

  const people = new Map<number, PersonalPersonEntry>();

  const likedPeople = await listLikedPeople(userId);
  for (const person of likedPeople) {
    upsertPerson(
      people,
      { id: person.tmdbId, name: person.title },
      100,
      "liked",
      { creator: true, actor: true }
    );
  }

  const seeds = await gatherTitleSeeds(userId);
  const batchSize = 5;
  for (let i = 0; i < seeds.length; i += batchSize) {
    const batch = seeds.slice(i, i + batchSize);
    await Promise.all(batch.map((seed) => extractPeopleFromTitle(people, seed)));
  }

  personalPeopleCache.set(userId, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    people,
  });

  return people;
}

export async function getPersonalPeopleSummary(userId: string): Promise<{
  creators: string[];
  actors: string[];
  all: string[];
}> {
  const people = await loadPersonalPeople(userId);
  const sorted = [...people.values()].sort((a, b) => b.score - a.score);

  const creators = sorted
    .filter((person) => person.isCreator)
    .slice(0, 20)
    .map((person) => person.name);
  const actors = sorted
    .filter((person) => person.isActor && !creators.includes(person.name))
    .slice(0, 15)
    .map((person) => person.name);

  return {
    creators,
    actors,
    all: sorted.slice(0, 25).map((person) => person.name),
  };
}

export async function resolvePersonForUser(
  userId: string,
  personName: string,
  creditType: "cast" | "crew" | "both"
): Promise<{ tmdbId: number; name: string } | null> {
  const personal = await loadPersonalPeople(userId);
  const personalMatches = [...personal.values()].filter((person) =>
    personNameMatches(personName, person.name)
  );

  if (personalMatches.length > 0) {
    personalMatches.sort((a, b) => b.score - a.score);
    const best = personalMatches[0];
    return { tmdbId: best.tmdbId, name: best.name };
  }

  const search = await searchPerson(personName);
  if (search.results.length === 0) return null;

  let best = pickBestPersonMatch(personName, search.results);
  let bestScore = -1;

  for (const person of search.results) {
    const nameScore = scorePersonNameMatch(personName, person.name);
    if (nameScore < 0) continue;

    let score = (person.popularity ?? 0) + nameScore;

    const familiar = personal.get(person.id);
    if (familiar) score += familiar.score * 100;
    if (
      (creditType === "crew" || creditType === "both") &&
      CREW_DEPARTMENTS.has(person.known_for_department ?? "")
    ) {
      score += 500;
    }

    if (score > bestScore) {
      bestScore = score;
      best = person;
    }
  }

  if (!best) return null;
  return { tmdbId: best.id, name: best.name };
}

function familiarSourceLabel(sources: Set<PersonSource>): string {
  if (sources.has("liked")) return "From your liked list";
  if (sources.has("watch")) return "From your watch history";
  if (sources.has("library")) return "From your Plex library";
  if (sources.has("liked_media")) return "From titles you liked";
  return "From your viewing profile";
}

export async function pickPersonForSearch(
  userId: string,
  query: string,
  tmdbResults: TmdbPersonSearchResult[]
): Promise<{ person: TmdbPersonSearchResult; familiar: boolean; familiarLabel?: string } | null> {
  const personal = await loadPersonalPeople(userId);
  const personalMatches = [...personal.values()].filter((person) =>
    personNameMatches(query, person.name)
  );

  if (personalMatches.length > 0) {
    personalMatches.sort((a, b) => b.score - a.score);
    const bestPersonal = personalMatches[0];
    const fromTmdb = tmdbResults.find((person) => person.id === bestPersonal.tmdbId);
    if (fromTmdb) {
      return {
        person: fromTmdb,
        familiar: true,
        familiarLabel: familiarSourceLabel(bestPersonal.sources),
      };
    }

    try {
      const lookup = await searchPerson(bestPersonal.name, 1);
      const resolved =
        lookup.results.find((person) => person.id === bestPersonal.tmdbId) ??
        lookup.results[0];
      if (resolved) {
        return {
          person: resolved,
          familiar: true,
          familiarLabel: familiarSourceLabel(bestPersonal.sources),
        };
      }
    } catch {
      // fall through to constructed result
    }

    return {
      person: {
        id: bestPersonal.tmdbId,
        name: bestPersonal.name,
        known_for_department: bestPersonal.isCreator ? "Creator" : undefined,
      },
      familiar: true,
      familiarLabel: familiarSourceLabel(bestPersonal.sources),
    };
  }

  let best = pickBestPersonMatch(query, tmdbResults);
  let bestScore = -1;

  for (const person of tmdbResults) {
    const nameScore = scorePersonNameMatch(query, person.name);
    if (nameScore < 0) continue;

    let score = (person.popularity ?? 0) + nameScore;

    const familiar = personal.get(person.id);
    if (familiar) {
      score += familiar.score * 100;
      if (!best || score > bestScore) {
        best = person;
        bestScore = score;
      }
    } else if (!best || score > bestScore) {
      best = person;
      bestScore = score;
    }
  }

  if (!best) return null;

  const familiarEntry = personal.get(best.id);
  return {
    person: best,
    familiar: !!familiarEntry,
    familiarLabel: familiarEntry ? familiarSourceLabel(familiarEntry.sources) : undefined,
  };
}

export async function fetchPersonFilmography(
  personId: number,
  limit = 24,
  filter: PersonCreditFilter = { creditType: "cast" }
): Promise<TmdbMediaItem[]> {
  const entries = await loadPersonCreditEntries(personId, filter.creditType);
  const significant = entries.filter((entry) => passesPersonCreditFilter(entry, filter));
  const lookup = buildPersonCreditLookup(significant);
  const items = significant.map((entry) => entry.item);
  return sortPersonSearchResults(items, lookup).slice(0, limit);
}
