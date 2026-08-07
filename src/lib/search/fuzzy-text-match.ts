const ARTICLE_WORDS = new Set(["the", "a", "an"]);

export type TextMatchMode = "person" | "title";

export interface TextMatchOptions {
  mode?: TextMatchMode;
}

export function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lowercase alphanumeric only — ignores spacing differences in compound titles. */
export function compactMatchText(value: string): string {
  return normalizeMatchText(value).replace(/\s+/g, "");
}

export function tokenizeMatchText(value: string): string[] {
  return normalizeMatchText(value).split(" ").filter(Boolean);
}

function stripArticles(tokens: string[]): string[] {
  if (tokens.length <= 1) return tokens;
  if (ARTICLE_WORDS.has(tokens[0])) return tokens.slice(1);
  return tokens;
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);

  for (let i = 0; i < a.length; i++) {
    curr[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      curr[j + 1] = Math.min(curr[j] + 1, prev[j + 1] + 1, prev[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  return prev[b.length];
}

function maxTokenEditDistance(tokenLength: number): number {
  if (tokenLength <= 3) return 0;
  if (tokenLength <= 6) return 1;
  return 2;
}

function maxFullStringEditDistance(length: number, mode: TextMatchMode): number {
  if (length <= 3) return 0;
  if (mode === "person") return maxTokenEditDistance(length);
  return Math.max(2, Math.floor(length * 0.25));
}

function tokensLikelyMatch(
  queryToken: string,
  candidateToken: string,
  options: TextMatchOptions = {}
): boolean {
  const mode = options.mode ?? "title";
  const q = queryToken.toLowerCase();
  const c = candidateToken.toLowerCase();
  if (q === c) return true;
  // Query is a prefix/abbreviation of the name ("chris" → "christopher").
  if (q.length >= 3 && c.startsWith(q)) return true;
  // For titles, also allow the candidate as a prefix of the query.
  // For people, do NOT — "christmas" must not match "chris".
  if (mode !== "person" && c.length >= 3 && q.startsWith(c)) return true;
  return levenshteinDistance(q, c) <= maxTokenEditDistance(Math.max(q.length, c.length));
}

/**
 * How many query tokens (from startQi) best cover one candidate token.
 * Tries longest joins first so "cross"+"road" matches "crossroad" instead of
 * stopping after the "cross" prefix alone.
 */
function queryTokensConsumedByCandidate(
  qParts: string[],
  startQi: number,
  namePart: string,
  options: TextMatchOptions
): number {
  if (startQi >= qParts.length) return 0;

  for (let end = qParts.length; end > startQi; end--) {
    const joined = qParts.slice(startQi, end).join("");
    if (joined.length > namePart.length + 2) continue;
    if (tokensLikelyMatch(joined, namePart, options)) {
      return end - startQi;
    }
  }

  const head = qParts[startQi];
  if (namePart.startsWith(head) && head.length >= 3) {
    return 1;
  }
  return 0;
}

/**
 * Consume query tokens left-to-right against candidate tokens, allowing
 * consecutive query tokens to concatenate into one candidate token
 * ("cross"+"road" → "crossroad").
 */
function tokensCoverCandidate(
  qParts: string[],
  nameParts: string[],
  options: TextMatchOptions
): boolean {
  let qi = 0;
  for (const namePart of nameParts) {
    if (qi >= qParts.length) return true;
    const used = queryTokensConsumedByCandidate(qParts, qi, namePart, options);
    if (used > 0) {
      qi += used;
      continue;
    }
    // Skip short filler candidate tokens (e.g. articles already stripped, but keep safe).
    if (namePart.length <= 3) continue;
    return false;
  }
  return qi >= qParts.length;
}

export function textsLikelyMatch(
  query: string,
  candidate: string,
  options: TextMatchOptions = {}
): boolean {
  const mode = options.mode ?? "title";
  const q = normalizeMatchText(query);
  const name = normalizeMatchText(candidate);
  if (!q || !name) return false;
  if (name === q) return true;

  // Ignore spacing in compound titles: "cross road springs" ↔ "crossroad springs".
  if (mode !== "person") {
    const qCompact = compactMatchText(query);
    const nameCompact = compactMatchText(candidate);
    if (qCompact && nameCompact) {
      if (qCompact === nameCompact) return true;
      if (qCompact.length >= 4 && (nameCompact.includes(qCompact) || qCompact.includes(nameCompact))) {
        return true;
      }
      const compactMax = Math.max(qCompact.length, nameCompact.length);
      if (
        compactMax >= 4 &&
        levenshteinDistance(qCompact, nameCompact) <= maxFullStringEditDistance(compactMax, mode)
      ) {
        return true;
      }
    }
  }

  if (mode === "person") {
    // Avoid "christmas" ⊆/⊇ "chris" style false positives on full-string includes.
    if (name.startsWith(q + " ") || name.endsWith(" " + q) || name.includes(" " + q + " ")) {
      return true;
    }
  } else if (name.includes(q) || q.includes(name)) {
    return true;
  }

  const maxLen = Math.max(q.length, name.length);
  if (
    maxLen >= 4 &&
    levenshteinDistance(q, name) <= maxFullStringEditDistance(maxLen, mode)
  ) {
    return true;
  }

  const qParts = stripArticles(tokenizeMatchText(query));
  const nameParts = stripArticles(tokenizeMatchText(candidate));
  if (qParts.length === 0 || nameParts.length === 0) return false;

  if (mode === "person" && qParts.length === 1) {
    const significantParts = nameParts.filter((part) => part.length >= 3);
    return significantParts.some((part) => tokensLikelyMatch(qParts[0], part, options));
  }

  if (mode !== "person" && tokensCoverCandidate(qParts, nameParts, options)) {
    return true;
  }

  return qParts.every((qPart) =>
    nameParts.some(
      (namePart) =>
        tokensLikelyMatch(qPart, namePart, options) || namePart.startsWith(qPart)
    )
  );
}

export function scoreTextMatch(
  query: string,
  candidate: string,
  options: TextMatchOptions = {}
): number {
  const mode = options.mode ?? "title";
  const q = normalizeMatchText(query);
  const name = normalizeMatchText(candidate);
  if (!q || !name) return -1;

  if (name === q) return 10_000;

  if (mode !== "person") {
    const qCompact = compactMatchText(query);
    const nameCompact = compactMatchText(candidate);
    if (qCompact && nameCompact && qCompact === nameCompact) {
      // Same letters, different spacing — treat almost as exact.
      return 9_500;
    }
  }

  if (name.startsWith(q)) return 5_000;
  if (mode !== "person" && q.startsWith(name)) return 4_000;
  if (name.includes(q)) return 1_000;
  if (mode !== "person" && q.includes(name)) return 800;

  if (mode !== "person") {
    const qCompact = compactMatchText(query);
    const nameCompact = compactMatchText(candidate);
    if (qCompact.length >= 4 && nameCompact.length >= 4) {
      if (nameCompact.includes(qCompact) || qCompact.includes(nameCompact)) {
        return 3_500;
      }
      const compactMax = Math.max(qCompact.length, nameCompact.length);
      const compactDist = levenshteinDistance(qCompact, nameCompact);
      if (compactDist <= maxFullStringEditDistance(compactMax, mode)) {
        return 2_800 - compactDist * 100;
      }
    }
  }

  const maxLen = Math.max(q.length, name.length);
  if (maxLen >= 4) {
    const dist = levenshteinDistance(q, name);
    if (dist <= maxFullStringEditDistance(maxLen, mode)) {
      return 2_500 - dist * 100;
    }
  }

  if (!textsLikelyMatch(query, candidate, options)) return -1;

  const qParts = stripArticles(tokenizeMatchText(query));
  const nameParts = stripArticles(tokenizeMatchText(candidate));
  let totalDist = 0;
  for (const qPart of qParts) {
    let bestDist = Infinity;
    for (const namePart of nameParts) {
      bestDist = Math.min(bestDist, levenshteinDistance(qPart, namePart));
    }
    totalDist += bestDist;
  }

  return 2_000 - totalDist * 100;
}

export function pickBestTextMatch<T>(
  query: string,
  items: T[],
  getLabel: (item: T) => string,
  getPopularity: (item: T) => number,
  options: TextMatchOptions = {}
): T | null {
  let best: T | null = null;
  let bestScore = -1;

  for (const item of items) {
    const labelScore = scoreTextMatch(query, getLabel(item), options);
    if (labelScore < 0) continue;

    const score = labelScore + getPopularity(item);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }

  return best;
}
