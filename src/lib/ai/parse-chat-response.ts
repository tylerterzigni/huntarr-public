import { extractPersonFromMessage } from "@/lib/ai/chat-person-patterns";
import { personNamesLikelyMatch } from "@/lib/search/person-name-match";
import { isPlausibleSpellingCorrection } from "@/lib/search/typo-variants";
import {
  applyGenrePhraseRules,
  extractThemeKeywordsFromMessage,
  isThemeTopicQuery,
  HIGH_RATING_PATTERNS,
  KEYWORD_PHRASE_RULES,
  matchesAny,
  MOOD_PHRASE_RULES,
  parseRelativeDateRange,
  shouldMatchTvMediaType,
  shouldMatchMovieMediaType,
  inferMediaTypeFromPersonQuery,
} from "@/lib/ai/chat-phrase-patterns";

function extractJsonObject(content: string): string {
  let trimmed = content.trim();
  if (trimmed.startsWith("```")) {
    trimmed = trimmed.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  }
  const replyKey = trimmed.search(/"reply"\s*:/);
  const criteriaKey = trimmed.search(/"criteria"\s*:/);
  const anchor =
    replyKey >= 0 && criteriaKey >= 0
      ? Math.min(replyKey, criteriaKey)
      : replyKey >= 0
        ? replyKey
        : criteriaKey;
  const start = anchor >= 0 ? trimmed.lastIndexOf("{", anchor) : trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

function unescapeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }
}

const MAX_CHAT_REPLY_LENGTH = 280;

function looksLikeCorruptedModelOutput(text: string): boolean {
  if (/<unk>/i.test(text)) return true;
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) return true;
  if (text.length > MAX_CHAT_REPLY_LENGTH) return true;
  if (/\b(?:Session|webkit|EmployeeExtractor|LOG\(|Pullurpurp|BVQuote)\b/.test(text)) {
    return true;
  }
  if (text.length > 120 && (text.match(/[A-Z]{2,}/g)?.length ?? 0) > 12) return true;
  if (text.length > 100 && !/[.!?]/.test(text) && text.split(/\s+/).length > 18) return true;
  return false;
}

export function buildContextualChatReply(
  userMessage: string,
  defaultReply = "Here are some titles that match your request."
): string {
  const person = extractPersonFromMessage(userMessage);
  if (person) {
    const lower = userMessage.toLowerCase();
    const movieScoped = shouldMatchMovieMediaType(lower);
    const tvScoped = shouldMatchTvMediaType(lower);

    if (person.creditType === "crew") {
      if (movieScoped && !tvScoped) {
        return `Here are movies from ${person.name}.`;
      }
      if (tvScoped && !movieScoped) {
        return `Here are shows from ${person.name}.`;
      }
      return `Here are titles from ${person.name}.`;
    }
    if (person.creditType === "cast") {
      if (movieScoped && !tvScoped) {
        return `Here are movies featuring ${person.name}.`;
      }
      if (tvScoped && !movieScoped) {
        return `Here are shows featuring ${person.name}.`;
      }
      return `Here are titles featuring ${person.name}.`;
    }
    return `Here are titles connected to ${person.name}.`;
  }

  if (isThemeTopicQuery(userMessage)) {
    return "Here are titles that match your topic.";
  }

  const lower = userMessage.toLowerCase();
  const likeTitle = extractMoreLikeTitle(userMessage);
  if (likeTitle) {
    return shouldMatchTvMediaType(lower)
      ? `Finding TV series similar to ${likeTitle}.`
      : `Finding titles similar to ${likeTitle}.`;
  }

  if (/\bcomedy|comedies|funny\b/.test(lower)) {
    return "Here are some comedy titles that match your request.";
  }
  if (/\bhorror|scary\b/.test(lower)) {
    return "Here are some horror titles that match your request.";
  }
  if (shouldMatchTvMediaType(lower)) {
    return "Here are some TV series that match your request.";
  }
  if (shouldMatchMovieMediaType(lower)) {
    return "Here are some movies that match your request.";
  }

  return defaultReply;
}

export function extractMoreLikeTitle(message: string): string | null {
  const patterns = [
    /\b(?:shows?|series|movies?|films?)\s+(?:like|similar to)\s+["']?(.+?)["']?\s*[?.!,]?\s*$/i,
    /\b(?:like|similar to|in the style of)\s+["']?(.+?)["']?\s*[?.!,]?\s*$/i,
    /\b(?:like|similar to|in the style of)\s+["']?(.+?)["']?(?:\s|$)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (!match) continue;

    const candidate = cleanMoreLikeTitleCandidate(
      match[1].trim().replace(/[?.!,]+$/, "").trim()
    );
    const genericPhrases =
      /^(chick flick(s)?|rom-?com(s)?|sitcom(s)?|horror(s)?|comed(y|ies)|drama(s)?|action(s)?|sci-?fi(s)?|thriller(s)?|show(s)?|movie(s)?|series|the|this|that|these|those|it|them)$/i;
    if (!candidate || candidate.length <= 2 || genericPhrases.test(candidate)) continue;
    return candidate;
  }

  return null;
}

/** Strip trailing filters so "the godfather that are under 2 hours" → "the godfather". */
export function cleanMoreLikeTitleCandidate(raw: string): string {
  let title = raw.trim().replace(/^["']|["']$/g, "").trim();
  if (!title) return "";

  title = title.replace(
    /\s+(?:that|which)\s+(?:are|is|have|has|were|was)\b.*$/i,
    ""
  );
  title = title.replace(
    /\s+(?:that|which)\s+(?:under|over|less|more|shorter|longer|below|above|from|with|in|on)\b.*$/i,
    ""
  );
  title = title.replace(
    /\s+(?:under|over|less than|more than|shorter than|longer than|below|above|at most|at least|no more than|no less than)\s+\d+.*$/i,
    ""
  );
  title = title.replace(
    /\s+(?:from|in|during|since|before|after)\s+(?:the\s+)?(?:\d{4}|19\d{2}|20\d{2}|last|past|this|recent).*$/i,
    ""
  );
  title = title.replace(/\s+with\s+(?:a\s+)?(?:runtime|length|duration)\b.*$/i, "");
  title = title.replace(/[?.!,]+$/g, "").trim();
  return title;
}

export function extractRuntimeConstraints(message: string): {
  runtimeMin?: number;
  runtimeMax?: number;
} {
  const lower = message.toLowerCase();
  const result: { runtimeMin?: number; runtimeMax?: number } = {};

  const toMinutes = (amount: number, unit: string): number => {
    if (/hour/.test(unit)) return Math.round(amount * 60);
    return Math.round(amount);
  };

  const maxMatch = lower.match(
    /\b(?:under|less than|shorter than|below|at most|no more than|max(?:imum)?(?:\s+of)?)\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b/
  );
  if (maxMatch) {
    result.runtimeMax = toMinutes(parseFloat(maxMatch[1]), maxMatch[2]);
  }

  const minMatch = lower.match(
    /\b(?:over|more than|longer than|above|at least|no less than|min(?:imum)?(?:\s+of)?)\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b/
  );
  if (minMatch) {
    result.runtimeMin = toMinutes(parseFloat(minMatch[1]), minMatch[2]);
  }

  const betweenMatch = lower.match(
    /\b(?:between|from)\s+(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|minutes?|mins?)?\s*(?:and|to|-)\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b/
  );
  if (betweenMatch) {
    const unit = betweenMatch[3];
    result.runtimeMin = toMinutes(parseFloat(betweenMatch[1]), unit);
    result.runtimeMax = toMinutes(parseFloat(betweenMatch[2]), unit);
  }

  return result;
}

function sanitizeChatReply(
  reply: string,
  userMessage: string,
  defaultReply: string
): string {
  const trimmed = reply.trim();
  if (!trimmed || looksLikeCorruptedModelOutput(trimmed)) {
    return buildContextualChatReply(userMessage, defaultReply);
  }
  return trimmed;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function mergeStringArrays(
  ...arrays: Array<string[] | undefined>
): string[] | undefined {
  const merged = uniqueStrings(arrays.flatMap((arr) => arr ?? []));
  return merged.length ? merged : undefined;
}

export function mergeChatCriteria(
  ...layers: Array<Record<string, unknown>>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const layer of layers) {
    Object.assign(merged, layer);
  }

  const genres = mergeStringArrays(
    ...layers.map((layer) =>
      Array.isArray(layer.genres)
        ? layer.genres.filter((g): g is string => typeof g === "string")
        : undefined
    )
  );
  if (genres) merged.genres = genres;

  const keywords = mergeStringArrays(
    ...layers.map((layer) =>
      Array.isArray(layer.keywords)
        ? layer.keywords.filter((k): k is string => typeof k === "string")
        : undefined
    )
  );
  if (keywords) merged.keywords = keywords;

  return merged;
}

const CORE_SEARCH_FIELDS = [
  "mediaType",
  "dateMin",
  "dateMax",
  "genres",
  "keywords",
  "yearMin",
  "yearMax",
  "minRating",
  "withPersonName",
  "withPersonCreditType",
  "moreLikeTitle",
] as const;

function sanitizeCriteriaConflicts(criteria: Record<string, unknown>): Record<string, unknown> {
  const keywords = Array.isArray(criteria.keywords)
    ? criteria.keywords.filter((k): k is string => typeof k === "string")
    : [];
  const genres = Array.isArray(criteria.genres)
    ? criteria.genres.filter((g): g is string => typeof g === "string")
    : [];

  const wantsSitcom =
    keywords.some((k) => k.toLowerCase() === "sitcom") ||
    genres.some((g) => g.toLowerCase() === "sitcom");

  if (wantsSitcom) {
    criteria.mediaType = "tv";
    const cleanedGenres = genres.filter((g) => !/stand[\s-]?up/i.test(g));
    criteria.genres = cleanedGenres.length ? cleanedGenres : ["Comedy"];
    criteria.keywords = [
      "sitcom",
      ...keywords.filter((k) => k.toLowerCase() !== "comedy" && k.toLowerCase() !== "sitcom"),
    ];
  } else if (criteria.mediaType === "tv") {
    criteria.genres = genres.filter((g) => !/stand[\s-]?up/i.test(g));
    criteria.keywords = keywords.filter((k) => k.toLowerCase() !== "comedy");
  }

  if (typeof criteria.moreLikeTitle === "string" && criteria.moreLikeTitle.trim()) {
    criteria.moreLikeTitle = cleanMoreLikeTitleCandidate(criteria.moreLikeTitle);
    delete criteria.genres;
    delete criteria.keywords;
    delete criteria.withKeywords;
  }

  const wantsStandUp = genres.some((g) => /stand[\s-]?up/i.test(g));
  if (wantsStandUp) {
    criteria.mediaType = "movie";
    criteria.genres = ["Stand-Up Comedy"];
    criteria.keywords = keywords.filter((k) => k.toLowerCase() !== "sitcom");
  }

  return criteria;
}

/** AI interprets the request first; deterministic rules only correct known mistakes or fill gaps. */
export function resolveChatCriteriaFromMessage(
  message: string,
  aiCriteria: Record<string, unknown> = {}
): Record<string, unknown> {
  const fallback = fallbackCriteriaFromMessage(message);
  const hasAiCriteria = Object.keys(aiCriteria).length > 0;
  const result: Record<string, unknown> = hasAiCriteria ? { ...aiCriteria } : { ...fallback };

  if (hasAiCriteria) {
    applyThemeCorrections(message, result, fallback);
    applyPersonCorrections(message, result, fallback);
    applyDateCorrections(message, result, fallback);

    for (const field of CORE_SEARCH_FIELDS) {
      if (result[field] === undefined && fallback[field] !== undefined) {
        result[field] = fallback[field];
      }
    }
  }

  // Keep “like X” from the message, but prefer a cleaner AI title when it matches
  // (including slight spelling corrections: "godfater" → "The Godfather").
  const likeTitle = extractMoreLikeTitle(message);
  if (likeTitle) {
    const aiTitle =
      typeof result.moreLikeTitle === "string" ? result.moreLikeTitle.trim() : "";
    const cleanedAi = aiTitle ? cleanMoreLikeTitleCandidate(aiTitle) : "";
    if (
      cleanedAi &&
      (cleanedAi.toLowerCase() === likeTitle.toLowerCase() ||
        likeTitle.toLowerCase().includes(cleanedAi.toLowerCase()) ||
        cleanedAi.toLowerCase().includes(likeTitle.toLowerCase()) ||
        isPlausibleSpellingCorrection(likeTitle, cleanedAi))
    ) {
      result.moreLikeTitle = cleanedAi;
    } else {
      result.moreLikeTitle = likeTitle;
    }
  } else if (typeof result.moreLikeTitle === "string" && result.moreLikeTitle.trim()) {
    result.moreLikeTitle = cleanMoreLikeTitleCandidate(result.moreLikeTitle);
  }

  const runtimeFromMessage = extractRuntimeConstraints(message);
  if (result.runtimeMax === undefined && runtimeFromMessage.runtimeMax != null) {
    result.runtimeMax = runtimeFromMessage.runtimeMax;
  }
  if (result.runtimeMin === undefined && runtimeFromMessage.runtimeMin != null) {
    result.runtimeMin = runtimeFromMessage.runtimeMin;
  }

  const supplementFields = [
    "mood",
    "exclusions",
    "excludeWatched",
    "excludeInLibrary",
    "runtimeMin",
    "runtimeMax",
    "language",
  ] as const;
  for (const field of supplementFields) {
    if (result[field] === undefined && aiCriteria[field] !== undefined) {
      result[field] = aiCriteria[field];
    }
    if (result[field] === undefined && fallback[field] !== undefined) {
      result[field] = fallback[field];
    }
  }

  return sanitizeCriteriaConflicts(result);
}

function applyThemeCorrections(
  message: string,
  result: Record<string, unknown>,
  fallback: Record<string, unknown>
): void {
  if (!isThemeTopicQuery(message)) return;

  delete result.withPersonName;
  delete result.withPersonCreditType;

  const fallbackKeywords = Array.isArray(fallback.keywords)
    ? fallback.keywords.filter((k): k is string => typeof k === "string")
    : [];
  if (fallbackKeywords.length) {
    const aiKeywords = Array.isArray(result.keywords)
      ? result.keywords.filter((k): k is string => typeof k === "string")
      : [];
    result.keywords = uniqueStrings([...aiKeywords, ...fallbackKeywords]);
  }
}

/** Prefer deterministic year/date windows from the user message over AI guesses. */
function applyDateCorrections(
  message: string,
  result: Record<string, unknown>,
  fallback: Record<string, unknown>
): void {
  const messageDateMin =
    typeof fallback.dateMin === "string" ? fallback.dateMin : undefined;
  const messageDateMax =
    typeof fallback.dateMax === "string" ? fallback.dateMax : undefined;

  if (messageDateMin || messageDateMax) {
    if (messageDateMin) result.dateMin = messageDateMin;
    else delete result.dateMin;
    if (messageDateMax) result.dateMax = messageDateMax;
    else delete result.dateMax;

    if (messageDateMin) {
      const y = Number.parseInt(messageDateMin.slice(0, 4), 10);
      if (Number.isFinite(y)) result.yearMin = y;
    } else {
      delete result.yearMin;
    }
    if (messageDateMax) {
      const y = Number.parseInt(messageDateMax.slice(0, 4), 10);
      if (Number.isFinite(y)) result.yearMax = y;
    } else {
      delete result.yearMax;
    }
    return;
  }

  // Normalize AI year-only fields into dates when the message had no explicit window.
  const yearMin =
    typeof result.yearMin === "number"
      ? result.yearMin
      : typeof result.yearMin === "string"
        ? Number.parseInt(result.yearMin, 10)
        : undefined;
  const yearMax =
    typeof result.yearMax === "number"
      ? result.yearMax
      : typeof result.yearMax === "string"
        ? Number.parseInt(result.yearMax, 10)
        : undefined;

  if (Number.isFinite(yearMin) && !result.dateMin) {
    result.dateMin = `${yearMin}-01-01`;
    result.yearMin = yearMin;
  }
  if (Number.isFinite(yearMax) && !result.dateMax) {
    result.dateMax = `${yearMax}-12-31`;
    result.yearMax = yearMax;
  }
}

function applyPersonCorrections(
  message: string,
  result: Record<string, unknown>,
  fallback: Record<string, unknown>
): void {
  if (isThemeTopicQuery(message)) {
    delete result.withPersonName;
    delete result.withPersonCreditType;
    return;
  }

  const verified = extractPersonFromMessage(message);
  if (verified) {
    const aiPerson =
      typeof result.withPersonName === "string" ? result.withPersonName.trim() : "";
    // Prefer AI's corrected spelling when it's clearly the same person
    // (e.g. typed "taylor sheridn" → AI "Taylor Sheridan").
    if (
      aiPerson &&
      (personNamesLikelyMatch(aiPerson, verified.name) ||
        isPlausibleSpellingCorrection(verified.name, aiPerson))
    ) {
      result.withPersonName = aiPerson;
      if (result.withPersonCreditType === undefined) {
        result.withPersonCreditType = verified.creditType;
      }
    } else {
      result.withPersonName = verified.name;
      result.withPersonCreditType = verified.creditType;
    }
    return;
  }

  // No real person in the message — drop AI-hallucinated people for theme/year queries
  // (e.g. "christmas movies from 2026" → "Chris Brancato").
  const lower = message.toLowerCase();
  const looksLikeThemeYearQuery =
    /\b(?:christmas|xmas|halloween|holiday|zombie|vampire|heist|superhero)\b/i.test(lower) ||
    /\b(?:from|in|during|of)\s+(?:19|20)\d{2}\b/i.test(lower) ||
    /\b(?:19|20)\d{2}\s+(?:movies?|films?|shows?|series)\b/i.test(lower);

  if (looksLikeThemeYearQuery) {
    delete result.withPersonName;
    delete result.withPersonCreditType;
    return;
  }

  const aiPerson =
    typeof result.withPersonName === "string" ? result.withPersonName.trim() : "";
  if (!aiPerson) return;

  const fallbackPerson =
    typeof fallback.withPersonName === "string" ? fallback.withPersonName.trim() : "";
  if (fallbackPerson && personNamesLikelyMatch(fallbackPerson, aiPerson)) return;

  if (/\b(?:about|related|involving|dealing with|on the topic of)\b/i.test(message)) {
    delete result.withPersonName;
    delete result.withPersonCreditType;
  }
}

export function fallbackCriteriaFromMessage(message: string): Record<string, unknown> {
  const lower = message.toLowerCase();
  const criteria: Record<string, unknown> = {};

  if (shouldMatchTvMediaType(lower)) {
    criteria.mediaType = "tv";
  }
  if (shouldMatchMovieMediaType(lower)) {
    criteria.mediaType = "movie";
  }

  const personMediaType = inferMediaTypeFromPersonQuery(message);
  if (personMediaType) {
    criteria.mediaType = personMediaType;
  }

  const genres: string[] = [];
  const keywords: string[] = [];
  applyGenrePhraseRules(lower, genres, keywords, criteria);
  if (genres.length) criteria.genres = uniqueStrings(genres);
  if (keywords.length) criteria.keywords = uniqueStrings(keywords);

  for (const rule of MOOD_PHRASE_RULES) {
    if (matchesAny(lower, rule.patterns)) {
      criteria.mood = rule.mood;
      break;
    }
  }

  for (const rule of KEYWORD_PHRASE_RULES) {
    if (matchesAny(lower, rule.patterns)) {
      keywords.push(rule.keyword);
    }
  }
  if (keywords.length) criteria.keywords = uniqueStrings(keywords);

  const themeKeywords = extractThemeKeywordsFromMessage(message);
  if (themeKeywords.length) {
    criteria.keywords = uniqueStrings([
      ...(Array.isArray(criteria.keywords) ? criteria.keywords : []),
      ...themeKeywords,
    ]);
  }

  const moreLikeTitle = extractMoreLikeTitle(message);
  if (moreLikeTitle) {
    criteria.moreLikeTitle = moreLikeTitle;
  }

  const runtime = extractRuntimeConstraints(message);
  if (runtime.runtimeMax != null) criteria.runtimeMax = runtime.runtimeMax;
  if (runtime.runtimeMin != null) criteria.runtimeMin = runtime.runtimeMin;

  const dateRange = parseRelativeDateRange(lower);
  if (dateRange) {
    criteria.dateMin = dateRange.dateMin;
    criteria.dateMax = dateRange.dateMax;
  }

  if (matchesAny(lower, HIGH_RATING_PATTERNS)) {
    criteria.minRating = 7;
  }

  const person =
    !isThemeTopicQuery(message) && themeKeywords.length === 0
      ? extractPersonFromMessage(message)
      : null;
  if (person) {
    criteria.withPersonName = person.name;
    criteria.withPersonCreditType = person.creditType;
  }

  return criteria;
}

export function hasDeterministicSearchIntent(criteria: Record<string, unknown>): boolean {
  return Boolean(
    criteria.withPersonName ||
    criteria.moreLikeTitle ||
    (Array.isArray(criteria.genres) && criteria.genres.length > 0) ||
    (Array.isArray(criteria.keywords) && criteria.keywords.length > 0) ||
    criteria.dateMin ||
    criteria.dateMax ||
    criteria.yearMin != null ||
    criteria.yearMax != null ||
    criteria.mediaType
  );
}

export function parseChatAIResponse(
  content: string,
  currentCriteria: Record<string, unknown>,
  userMessage: string
): { reply: string; criteria: Record<string, unknown>; confidence: "high" | "low" } {
  const defaultReply = buildContextualChatReply(userMessage);

  if (!content.trim()) {
    return {
      reply: defaultReply,
      criteria: resolveChatCriteriaFromMessage(userMessage),
      confidence: "low",
    };
  }

  try {
    const parsed = JSON.parse(extractJsonObject(content)) as {
      reply?: unknown;
      criteria?: Record<string, unknown>;
      confidence?: unknown;
    };
    const rawReply =
      typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : "";
    const criteria = resolveChatCriteriaFromMessage(
      userMessage,
      parsed.criteria ?? {}
    );
    const confidence =
      parsed.confidence === "low" || parsed.confidence === "high"
        ? parsed.confidence
        : "high";
    return {
      reply: sanitizeChatReply(rawReply, userMessage, defaultReply),
      criteria,
      confidence,
    };
  } catch {
    const replyMatch = content.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (replyMatch) {
      const rawReply = unescapeJsonString(replyMatch[1]).trim();
      return {
        reply: sanitizeChatReply(rawReply, userMessage, defaultReply),
        criteria: resolveChatCriteriaFromMessage(userMessage),
        confidence: "low",
      };
    }

    return {
      reply: defaultReply,
      criteria: resolveChatCriteriaFromMessage(userMessage),
      confidence: "low",
    };
  }
}
