import { getPersonDetails } from "@/lib/integrations/tmdb/client";
import { isKeywordBackedGenreId } from "@/lib/discover/genres";
import { getMediaTitle, inferMediaType, mediaItemKey } from "@/lib/integrations/tmdb/helpers";
import {
  localePriorityScore,
  sortByLocalePreference,
} from "@/lib/recommendations/locale-priority";
import { itemMatchesDateCriteria } from "@/lib/search/date-criteria";
import type { MediaType, SearchCriteria, TmdbMediaItem } from "@/types";

interface PersonCreditRaw extends TmdbMediaItem {
  media_type?: MediaType;
  character?: string;
  job?: string;
  order?: number;
  episode_count?: number;
  genre_ids?: number[];
}

export interface PersonCreditEntry {
  mediaType: MediaType;
  id: number;
  item: TmdbMediaItem;
  creditKind: "cast" | "crew";
  role: string;
  castOrder?: number;
  episodeCount?: number;
  genreIds?: number[];
}

const CREW_ROLE_RANK: Array<[string, number]> = [
  ["Creator", 100],
  ["Executive Producer", 90],
  ["Showrunner", 85],
  ["Writer", 70],
  ["Producer", 60],
  ["Director", 50],
];

function crewRoleRank(role: string): number {
  const normalized = role.toLowerCase();
  for (const [label, rank] of CREW_ROLE_RANK) {
    if (normalized.includes(label.toLowerCase())) return rank;
  }
  return 10;
}

function inferCreditMediaType(credit: PersonCreditRaw): MediaType | null {
  if (credit.media_type === "movie" || credit.media_type === "tv") return credit.media_type;
  if (credit.title) return "movie";
  if (credit.name) return "tv";
  return null;
}

function shouldReplaceCredit(existing: PersonCreditEntry, incoming: PersonCreditEntry): boolean {
  if (incoming.creditKind === "cast" && existing.creditKind === "crew") return true;
  if (incoming.creditKind === "crew" && existing.creditKind === "cast") return false;

  if (incoming.creditKind === "cast" && existing.creditKind === "cast") {
    const incomingEpisodes = incoming.episodeCount ?? 0;
    const existingEpisodes = existing.episodeCount ?? 0;
    if (incomingEpisodes !== existingEpisodes) {
      return incomingEpisodes > existingEpisodes;
    }
    return (incoming.castOrder ?? 999) < (existing.castOrder ?? 999);
  }

  if (incoming.creditKind === "crew" && existing.creditKind === "crew") {
    return crewRoleRank(incoming.role) > crewRoleRank(existing.role);
  }

  return false;
}

function upsertCreditEntry(
  lookup: Map<string, PersonCreditEntry>,
  entry: PersonCreditEntry
) {
  const key = `${entry.mediaType}:${entry.id}`;
  const existing = lookup.get(key);
  if (!existing) {
    lookup.set(key, entry);
    return;
  }

  if (shouldReplaceCredit(existing, entry)) {
    lookup.set(key, {
      ...entry,
      item: { ...existing.item, ...entry.item },
    });
  }
}

export async function loadPersonCreditEntries(
  personId: number,
  creditType: "cast" | "crew" | "both"
): Promise<PersonCreditEntry[]> {
  const details = await getPersonDetails(personId);
  const combined = details.combined_credits as
    | { cast?: PersonCreditRaw[]; crew?: PersonCreditRaw[] }
    | undefined;

  const lookup = new Map<string, PersonCreditEntry>();

  const tvCredits = details.tv_credits as { cast?: PersonCreditRaw[] } | undefined;
  const tvEpisodeCounts = new Map<number, number>();
  for (const credit of tvCredits?.cast ?? []) {
    if (!credit.id || !credit.episode_count) continue;
    const current = tvEpisodeCounts.get(credit.id) ?? 0;
    tvEpisodeCounts.set(credit.id, Math.max(current, credit.episode_count));
  }

  const addCredits = (credits: PersonCreditRaw[] | undefined, creditKind: "cast" | "crew") => {
    for (const credit of credits ?? []) {
      const mediaType = inferCreditMediaType(credit);
      if (!mediaType) continue;

      const role =
        creditKind === "cast"
          ? credit.character?.trim() || "Cast"
          : credit.job?.trim() || "Crew";

      upsertCreditEntry(lookup, {
        mediaType,
        id: credit.id,
        item: { ...credit, media_type: mediaType },
        creditKind,
        role,
        castOrder: creditKind === "cast" ? credit.order : undefined,
        episodeCount:
          mediaType === "tv"
            ? (credit.episode_count ?? tvEpisodeCounts.get(credit.id))
            : undefined,
        genreIds: credit.genre_ids,
      });
    }
  };

  if (creditType === "cast" || creditType === "both") {
    addCredits(combined?.cast, "cast");
  }
  if (creditType === "crew" || creditType === "both") {
    addCredits(combined?.crew, "crew");
  }

  return [...lookup.values()];
}

export function buildPersonCreditLookup(
  entries: PersonCreditEntry[]
): Map<string, PersonCreditEntry> {
  const lookup = new Map<string, PersonCreditEntry>();
  for (const entry of entries) {
    upsertCreditEntry(lookup, entry);
  }
  return lookup;
}

export function registerDiscoveredPersonCredit(
  lookup: Map<string, PersonCreditEntry>,
  item: TmdbMediaItem,
  creditKind: "cast" | "crew"
): void {
  const mediaType = inferMediaType(item);
  upsertCreditEntry(lookup, {
    mediaType,
    id: item.id,
    item: { ...item, media_type: mediaType },
    creditKind,
    role: creditKind === "cast" ? "Cast" : "Creator",
  });
}

export function filterByVerifiedPersonCredits(
  items: TmdbMediaItem[],
  lookup: Map<string, PersonCreditEntry>
): TmdbMediaItem[] {
  return items.filter((item) => lookup.has(mediaItemKey(item)));
}

const TALK_SHOW_GENRE_IDS = new Set([10767, 10763]);
const TALK_SHOW_TITLE_PATTERN =
  /\b(late show|late night|tonight show|tonight with|talk show|with kelly|with .* colbert|with .* leno|with .* fallon|with .* kimmel|with .* conan|ellen\b|today show|good morning america|dr\. phil|watch what happens|saturday night live\b|snl\b|the oscars?\b|\boscars?\b|\bgrammys?\b|\bemmys?\b|\btonys?\b|\bgolden globes?\b|\bacademy awards?\b|\bmtv movie\b|\bmtv video music\b)/i;

function isTalkShowEntry(entry: PersonCreditEntry): boolean {
  const title = getMediaTitle(entry.item);
  if (TALK_SHOW_TITLE_PATTERN.test(title)) return true;
  return (entry.genreIds ?? []).some((id) => TALK_SHOW_GENRE_IDS.has(id));
}

export type PersonCreditFilter = {
  creditType: "cast" | "crew" | "both";
  crewRole?: "creator";
};

function isExcludedCastRole(role: string): boolean {
  const normalized = role.toLowerCase();
  if (normalized.includes("uncredited")) return true;
  if (normalized.includes("archive footage")) return true;
  if (/\bself\b/.test(normalized)) return true;
  if (normalized.includes("cameo")) return true;
  return false;
}

export function isSignificantCastCredit(entry: PersonCreditEntry): boolean {
  if (entry.creditKind !== "cast") return false;
  if (isTalkShowEntry(entry)) return false;
  if (isExcludedCastRole(entry.role)) return false;

  if (entry.mediaType === "tv") {
    const episodes = entry.episodeCount;
    // Star/co-star = 4+ episodes; excludes guest arcs (e.g. CSI x3) and talk spots.
    if (episodes === undefined || episodes < 4) return false;
    return true;
  }

  const order = entry.castOrder;
  if (order !== undefined && order >= 0) return order <= 10;
  return true;
}

export function isCreatorCrewCredit(entry: PersonCreditEntry): boolean {
  if (entry.creditKind !== "crew") return false;
  const role = entry.role.trim().toLowerCase();
  return (
    role === "creator" ||
    role === "co-creator" ||
    role.includes("series creator")
  );
}

/** Meaningful behind-the-camera credits for “movies/shows by X”. */
export function isSignificantCrewCredit(entry: PersonCreditEntry): boolean {
  if (entry.creditKind !== "crew") return false;
  if (isCreatorCrewCredit(entry)) return true;

  const role = entry.role.trim().toLowerCase();
  return (
    role === "director" ||
    role === "writer" ||
    role === "screenplay" ||
    role === "screenstory" ||
    role === "story" ||
    role === "teleplay" ||
    role === "showrunner" ||
    role === "executive producer" ||
    role === "co-executive producer" ||
    role === "producer" ||
    role === "co-producer"
  );
}

export function passesPersonCreditFilter(
  entry: PersonCreditEntry,
  filter: PersonCreditFilter
): boolean {
  if (filter.creditType === "cast") {
    return isSignificantCastCredit(entry);
  }
  if (filter.creditType === "crew") {
    // Strict “created by” only when explicitly requested; otherwise include writers/directors/EPs.
    if (filter.crewRole === "creator") {
      return isCreatorCrewCredit(entry);
    }
    return isSignificantCrewCredit(entry);
  }
  return isSignificantCastCredit(entry) || isSignificantCrewCredit(entry);
}

function personCreditFilterFromCriteria(criteria: SearchCriteria): PersonCreditFilter | null {
  if (!criteria.withPerson) return null;
  return {
    creditType: criteria.withPerson.creditType,
    crewRole: criteria.withPerson.crewRole,
  };
}

function applyCastRolePenalties(role: string, score: number): number {
  if (role.includes("uncredited")) score -= 7_000;
  if (role.includes("archive footage")) score -= 5_000;
  if (/\bself\b/.test(role)) score -= 6_000;
  if (role.includes("cameo")) score -= 2_000;
  if (role.includes("(voice)")) score -= 1_000;
  return score;
}

function movieCastProminenceScore(entry: PersonCreditEntry): number {
  const role = entry.role.toLowerCase();
  let score = 0;

  if (entry.castOrder !== undefined && entry.castOrder >= 0) {
    score += Math.max(500, 12_000 - entry.castOrder * 800);
  } else {
    score += 2_500;
  }

  return applyCastRolePenalties(role, score);
}

function tvCastProminenceScore(entry: PersonCreditEntry): number {
  const role = entry.role.toLowerCase();
  let score = 0;
  const episodes = entry.episodeCount ?? 0;

  if (isTalkShowEntry(entry)) {
    score = -4_000 + Math.min(episodes, 3) * 200;
    return applyCastRolePenalties(role, score);
  }

  if (episodes > 0) {
    if (episodes >= 20) {
      score += 16_000 + Math.min(episodes, 250) * 25;
    } else if (episodes >= 8) {
      score += 11_000 + episodes * 30;
    } else if (episodes >= 4) {
      score += 6_000 + episodes * 20;
    } else if (episodes <= 2) {
      score += 500;
    } else {
      score += 3_000 + episodes * 15;
    }
  } else if (entry.castOrder !== undefined && entry.castOrder >= 0) {
    score += Math.max(500, 4_000 - entry.castOrder * 150);
  } else {
    score += 1_500;
  }

  if (episodes > 0 && episodes <= 2) {
    score -= 5_000;
  } else if (episodes > 0 && episodes <= 4) {
    score -= 1_500;
  }

  if (!role || role === "cast") {
    score -= 500;
  }

  return applyCastRolePenalties(role, score);
}

function getItemDate(item: TmdbMediaItem): string | null {
  return item.first_air_date ?? item.release_date ?? null;
}

export function personCreditProminenceScore(entry: PersonCreditEntry | undefined): number {
  if (!entry) return 0;

  if (entry.creditKind === "crew") {
    return 1_000 + crewRoleRank(entry.role) * 10;
  }

  if (entry.mediaType === "tv") {
    return tvCastProminenceScore(entry);
  }

  return movieCastProminenceScore(entry);
}

export function personSearchScore(item: TmdbMediaItem): number {
  const votes = item.vote_count ?? 0;
  return (
    (item.popularity ?? 0) * 10 +
    (item.vote_average ?? 0) * 10 +
    Math.log10(votes + 1) * 5 +
    localePriorityScore(item) * 100
  );
}

export function sortPersonSearchResults<T extends TmdbMediaItem>(
  items: T[],
  creditLookup?: Map<string, PersonCreditEntry>
): T[] {
  return sortByLocalePreference(items).sort((a, b) => {
    if (creditLookup) {
      const prominenceDiff =
        personCreditProminenceScore(creditLookup.get(mediaItemKey(b))) -
        personCreditProminenceScore(creditLookup.get(mediaItemKey(a)));
      if (prominenceDiff !== 0) return prominenceDiff;
    }

    const popDiff = (b.popularity ?? 0) - (a.popularity ?? 0);
    if (popDiff !== 0) return popDiff;

    const scoreDiff = personSearchScore(b) - personSearchScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    const dateA = getItemDate(a) ?? "";
    const dateB = getItemDate(b) ?? "";
    return dateB.localeCompare(dateA);
  });
}

export function filterPersonCreditsByCriteria(
  entries: PersonCreditEntry[],
  criteria: SearchCriteria
): PersonCreditEntry[] {
  const personFilter = personCreditFilterFromCriteria(criteria);

  return entries.filter((entry) => {
    if (personFilter && !passesPersonCreditFilter(entry, personFilter)) {
      return false;
    }

    const { item, mediaType } = entry;
    if (criteria.mediaType && criteria.mediaType !== "all" && mediaType !== criteria.mediaType) {
      return false;
    }

    if (!itemMatchesDateCriteria(item, criteria)) {
      return false;
    }

    if (criteria.minRating && (item.vote_average ?? 0) < criteria.minRating) {
      return false;
    }

    const genreIds = (criteria.genres ?? []).filter(
      (id) => id > 0 && !isKeywordBackedGenreId(id)
    );
    if (genreIds.length > 0) {
      const itemGenres = entry.genreIds ?? item.genre_ids ?? [];
      if (!itemGenres.length || !genreIds.some((id) => itemGenres.includes(id))) {
        return false;
      }
    }

    return true;
  });
}

export function buildVerifiedPersonReason(
  item: TmdbMediaItem,
  criteria: SearchCriteria,
  lookup: Map<string, PersonCreditEntry>
): string {
  const title = getMediaTitle(item);
  const credit = lookup.get(mediaItemKey(item));
  const date = getItemDate(item);
  const year = date ? date.slice(0, 4) : null;
  const mediaType = inferMediaType(item);
  const parts: string[] = [mediaType === "tv" ? "TV series" : "Movie"];

  if (credit && criteria.withPerson) {
    if (credit.creditKind === "cast") {
      const role = credit.role && credit.role !== "Cast" ? ` as ${credit.role}` : "";
      parts.push(`starring ${criteria.withPerson.name}${role}`);
    } else {
      parts.push(`${credit.role} — ${criteria.withPerson.name}`);
    }
  }

  if (year) {
    parts.push(mediaType === "tv" ? `first aired ${year}` : `released ${year}`);
  }

  return `${title} — ${parts.join(", ")}`;
}
