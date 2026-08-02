import { extractPersonFromMessage } from "@/lib/ai/chat-person-patterns";
import { extractMoreLikeTitle } from "@/lib/ai/parse-chat-response";
import { mediaItemKey } from "@/lib/integrations/tmdb/helpers";
import type { RecommendationItem, SearchCriteria } from "@/types";

const MORE_RESULTS_PATTERNS = [
  /^(?:show\s+(?:me\s+)?)?more(?:\s+results?)?[.!?]*$/i,
  /^(?:show\s+(?:me\s+)?)?(?:more\s+results?|see\s+more|load\s+more)[.!?]*$/i,
  /^(?:give\s+me\s+)?(?:some\s+)?more(?:\s+results?)?[.!?]*$/i,
  /^(?:any\s+)?more(?:\s+results?)?\??[.!?]*$/i,
  /^(?:show\s+(?:me\s+)?)?(?:another|additional)\s+(?:page|batch|set)[.!?]*$/i,
];

const MORE_LIKE_CONTINUATION_PATTERNS = [
  /\bmore\b.*\b(?:shows?|series|movies?|films?)\s+(?:like|similar to)\b/i,
  /\b(?:shows?|series|movies?|films?)\s+(?:like|similar to)\b.*\bmore\b/i,
  /\bmore\b.*\b(?:like|similar to)\b/i,
];

const MORE_PERSON_CONTINUATION_PATTERNS = [
  /\bmore\b.*\b(?:movies?|films?|shows?|series)\s+(?:with|featuring|starring|from)\b/i,
  /\bmore\b.*\b(?:from|by)\s+[A-Z]/,
];

const MORE_THEME_CONTINUATION_PATTERNS = [
  /\bmore\b.*\b(?:comedy|comedies|horror|drama|action|sci-?fi|thriller|rom-?com|sitcom)\b/i,
  /\bmore\b.*\b(?:movies?|films?|shows?|series)\b/i,
];

const CORRECTION_PATTERNS = [
  /^this\s+is\s+wrong[.!?]*$/i,
  /^this\s+is\s+not\s+correct[.!?]*$/i,
  /^this\s+is\s+not\s+accurate[.!?]*$/i,
  /^these?\s+(?:are|is)\s+(?:wrong|incorrect|inaccurate)[.!?]*$/i,
  /^(?:that|those)\s+(?:is|are)\s+(?:wrong|incorrect|inaccurate|not\s+correct|not\s+accurate)[.!?]*$/i,
  /^not\s+(?:correct|accurate|right)[.!?]*$/i,
  /^inaccurate[.!?]*$/i,
  /^wrong\s+results?[.!?]*$/i,
  /^try\s+again[.!?]*$/i,
  /^these?\s+(?:results?\s+)?(?:are\s+)?wrong[.!?]*$/i,
];

export function isMoreResultsRequest(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  return MORE_RESULTS_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isMoreLikeContinuationRequest(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || !/\bmore\b/i.test(trimmed)) return false;
  return MORE_LIKE_CONTINUATION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isPersonContinuationRequest(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || !/\bmore\b/i.test(trimmed)) return false;
  if (isMoreLikeContinuationRequest(trimmed)) return false;
  return MORE_PERSON_CONTINUATION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isThemeContinuationRequest(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || !/\bmore\b/i.test(trimmed)) return false;
  if (isMoreLikeContinuationRequest(trimmed) || isPersonContinuationRequest(trimmed)) return false;
  return MORE_THEME_CONTINUATION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** Continue prior search with pagination — works for any search type. */
export function isSearchContinuationRequest(message: string): boolean {
  return (
    isMoreResultsRequest(message) ||
    isMoreLikeContinuationRequest(message) ||
    isPersonContinuationRequest(message) ||
    isThemeContinuationRequest(message)
  );
}

export function buildContinuationReply(criteria: SearchCriteria): string {
  if (criteria.moreLike?.title) {
    const anchor = criteria.moreLike.title;
    return criteria.moreLike.mediaType === "movie"
      ? `Here are more movies similar to ${anchor}.`
      : `Here are more shows similar to ${anchor}.`;
  }
  if (criteria.withPerson?.name) {
    return `Here are more titles featuring ${criteria.withPerson.name}.`;
  }
  return "Here are more titles that match your request.";
}

export function buildContinuationCriteriaPatch(message: string): Record<string, unknown> {
  const likeTitle = extractMoreLikeTitle(message);
  if (likeTitle) return { moreLikeTitle: likeTitle };

  const person = extractPersonFromMessage(message);
  if (person) {
    return {
      withPersonName: person.name,
      withPersonCreditType: person.creditType,
    };
  }

  return {};
}

export function isCorrectionRequest(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  return CORRECTION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** Last user search that is not a "more" or "try again" control message. */
export function findPriorSearchMessage(
  messages: Array<{ role: string; content?: string }> | undefined
): string | null {
  if (!messages?.length) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user" || typeof msg.content !== "string") continue;
    const text = msg.content.trim();
    if (!text) continue;
    if (
      isMoreResultsRequest(text) ||
      isMoreLikeContinuationRequest(text) ||
      isPersonContinuationRequest(text) ||
      isThemeContinuationRequest(text) ||
      isCorrectionRequest(text)
    ) {
      continue;
    }
    return text;
  }
  return null;
}

export function collectShownMediaKeys(
  messages: Array<{ role: string; items?: unknown[] }> | undefined
): string[] {
  const keys = new Set<string>();
  for (const message of messages ?? []) {
    if (message.role !== "assistant") continue;
    for (const raw of message.items ?? []) {
      const item = raw as RecommendationItem;
      if (item?.id && (item.media_type === "movie" || item.media_type === "tv")) {
        keys.add(mediaItemKey(item));
      }
    }
  }
  return [...keys];
}

export function hasPriorSearchCriteria(criteria: Record<string, unknown> | null | undefined): boolean {
  if (!criteria || typeof criteria !== "object") return false;
  return Object.keys(criteria).length > 0;
}

export function criteriaSnapshotToSearchCriteria(
  snapshot: Record<string, unknown>
): SearchCriteria {
  return snapshot as SearchCriteria;
}
