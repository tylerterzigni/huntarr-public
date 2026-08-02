import { isThemeTopicQuery } from "@/lib/ai/chat-phrase-patterns";

export type PersonCreditType = "cast" | "crew" | "both";

const BLOCKED_NAME_WORDS = new Set([
  "sitcom",
  "sitcoms",
  "comedy",
  "comedies",
  "stand",
  "standup",
  "stand-up",
  "horror",
  "horrors",
  "action",
  "drama",
  "dramas",
  "scary",
  "funny",
  "recent",
  "new",
  "past",
  "last",
  "good",
  "best",
  "top",
  "high",
  "rated",
  "some",
  "any",
  "more",
  "find",
  "show",
  "get",
  "me",
  "the",
  "a",
  "an",
  "special",
  "specials",
  "movie",
  "movies",
  "film",
  "films",
  "show",
  "shows",
  "series",
  "tv",
  "related",
  "about",
  "marijuana",
  "weed",
  "cannabis",
  "involving",
]);

function titleCaseName(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function isValidPersonName(name: string): boolean {
  const words = name.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.some((word) => BLOCKED_NAME_WORDS.has(word))) {
    return false;
  }
  if (words.length === 1 && words[0].length < 4) return false;
  return name.trim().length >= 3;
}

function isPerformerQuery(message: string): boolean {
  return (
    /\bstand[\s-]?up\b/i.test(message) ||
    /\bcomedy specials?\b/i.test(message) ||
    /\b(starring|featuring)\b/i.test(message) ||
    /\b(?:movies?|films?|shows?|series|comedies)\s+with\b/i.test(message)
  );
}

export function detectCreditType(message: string): PersonCreditType {
  if (/\b(starring|featuring)\b/i.test(message)) return "cast";
  if (/\b(?:movies?|films?|shows?|series|comedies)\s+with\b/i.test(message)) return "cast";
  if (
    /\b(?:find|show|get)\s+(?:me\s+)?[a-z][a-z\s'.-]+\s+(?:movies?|films?)\b/i.test(message) &&
    !/\b(?:by|from|created by|written by|directed by)\s+/i.test(message)
  ) {
    return "cast";
  }
  if (isPerformerQuery(message)) return "cast";
  if (/\b(?:shows?|series|movies?|films?)\s+by\b/i.test(message)) return "crew";
  if (/\b(by|from|created by|written by|directed by)\b/i.test(message)) {
    return "crew";
  }
  return "both";
}

function cleanCapturedName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s+(?:from|in|on|that|for)\s+.*$/i, "")
    .trim();
}

/** Greedy capture — non-greedy {2,80}? stops at the first word boundary and drops last names. */
const PERSON_NAME = "([a-z][a-z\\s'.-]+)";

export function extractPersonFromMessage(message: string): {
  name: string;
  creditType: PersonCreditType;
} | null {
  if (isThemeTopicQuery(message)) return null;

  const creditType = detectCreditType(message);

  const patterns = [
    new RegExp(
      `(?:stand[\\s-]?up(?:\\s+comedy)?(?:\\s+specials?)?|comedy specials?)\\s+(?:by|from|starring|featuring)\\s+${PERSON_NAME}\\s*$`,
      "i"
    ),
    new RegExp(
      `(?:find|show|get)\\s+(?:me\\s+)?(?:movies?|films?|shows?|series)\\s+with\\s+${PERSON_NAME}\\s*$`,
      "i"
    ),
    new RegExp(`(?:movies?|films?|shows?|series)\\s+with\\s+${PERSON_NAME}\\s*$`, "i"),
    new RegExp(
      `(?:shows?|series|movies?|films?)\\s+(?:by|from|created by|written by|directed by)\\s+${PERSON_NAME}(?:\\s+(?:from|in|during|over)\\b|\\s*$)`,
      "i"
    ),
    new RegExp(
      `(?:find|show|get)\\s+(?:me\\s+)?${PERSON_NAME}\\s+(?:tv\\s+)?(?:shows?|series)\\b`,
      "i"
    ),
    new RegExp(`(?:find|show|get)\\s+(?:me\\s+)?${PERSON_NAME}\\s+(?:movies?|films?)\\b`, "i"),
    new RegExp(`\\b${PERSON_NAME}\\s+(?:tv\\s+)?(?:shows?|series)\\b`, "i"),
    new RegExp(`(?:starring|featuring|with)\\s+${PERSON_NAME}\\s*$`, "i"),
    new RegExp(`\\b(?:by|from|starring|featuring)\\s+${PERSON_NAME}\\s*$`, "i"),
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (!match?.[1]) continue;

    const name = cleanCapturedName(match[1]);
    if (!isValidPersonName(name)) continue;

    return { name: titleCaseName(name), creditType };
  }

  return null;
}
