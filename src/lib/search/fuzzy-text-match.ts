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

export function tokensLikelyMatch(queryToken: string, candidateToken: string): boolean {
  const q = queryToken.toLowerCase();
  const c = candidateToken.toLowerCase();
  if (q === c) return true;
  if (q.length >= 3 && c.startsWith(q)) return true;
  if (c.length >= 3 && q.startsWith(c)) return true;
  return levenshteinDistance(q, c) <= maxTokenEditDistance(Math.max(q.length, c.length));
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
  if (name.includes(q) || q.includes(name)) return true;

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
    return significantParts.some((part) => tokensLikelyMatch(qParts[0], part));
  }

  return qParts.every((qPart) =>
    nameParts.some(
      (namePart) => tokensLikelyMatch(qPart, namePart) || namePart.startsWith(qPart)
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
  if (name.startsWith(q)) return 5_000;
  if (q.startsWith(name)) return 4_000;
  if (name.includes(q)) return 1_000;
  if (q.includes(name)) return 800;

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
