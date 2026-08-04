import {
  levenshteinDistance,
  normalizeMatchText,
  textsLikelyMatch,
} from "@/lib/search/fuzzy-text-match";

/** QWERTY neighbors for light typo expansion. */
const KEYBOARD_NEIGHBORS: Record<string, string> = {
  a: "qwsz",
  b: "vghn",
  c: "xdfv",
  d: "ersfcx",
  e: "rdsw",
  f: "rtdgcv",
  g: "tyfhvb",
  h: "yugjbn",
  i: "uojk",
  j: "uihknm",
  k: "iojlm",
  l: "kop",
  m: "njk",
  n: "bhjm",
  o: "iplk",
  p: "ol",
  q: "wa",
  r: "edft",
  s: "awedxz",
  t: "rfgy",
  u: "yhji",
  v: "cfgb",
  w: "qase",
  x: "zsdc",
  y: "tghu",
  z: "asx",
};

/**
 * Bounded query variants for slight typos (swap / delete / doubled letters /
 * nearby keys). Keeps API fan-out small while recovering common misspellings.
 */
export function generateTypoQueryVariants(query: string, limit = 24): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const variants = new Set<string>([trimmed]);
  const push = (value: string) => {
    const next = value.replace(/\s+/g, " ").trim();
    if (next.length > 1) variants.add(next);
  };

  // shrinkingg → shrinking, goddfather → godfather
  push(trimmed.replace(/([a-zA-Z])\1+/g, "$1"));

  const words = trimmed.split(/\s+/).filter(Boolean);
  for (let w = 0; w < words.length; w++) {
    const word = words[w];
    if (word.length < 4) continue;

    const replaceWord = (nextWord: string) => {
      const next = [...words];
      next[w] = nextWord;
      push(next.join(" "));
    };

    // Adjacent letter swaps: "sheridna" → "sheridan"
    for (let i = 0; i < word.length - 1; i++) {
      replaceWord(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2));
    }

    // Single deletions: "godfatheer" → "godfather"
    if (word.length >= 5) {
      for (let i = 0; i < word.length; i++) {
        replaceWord(word.slice(0, i) + word.slice(i + 1));
      }
    }

    // Keyboard-adjacent substitutions (cap per word)
    let subCount = 0;
    for (let i = 0; i < word.length && subCount < 8; i++) {
      const ch = word[i]!.toLowerCase();
      const neighbors = KEYBOARD_NEIGHBORS[ch];
      if (!neighbors) continue;
      for (const neighbor of neighbors) {
        if (subCount >= 8) break;
        const replaced =
          word.slice(0, i) +
          (word[i] === word[i]!.toUpperCase() ? neighbor.toUpperCase() : neighbor) +
          word.slice(i + 1);
        replaceWord(replaced);
        subCount += 1;
      }
    }

    // Common missing-letter inserts (godfater → godfather, sheridn → sheridan)
    if (word.length >= 5 && word.length <= 12) {
      for (let i = 0; i <= word.length; i++) {
        for (const letter of "aeiouh") {
          replaceWord(word.slice(0, i) + letter + word.slice(i));
        }
      }
    }
  }

  // Prefer original first, then shorter/closer-looking variants.
  const ordered = [...variants].sort((a, b) => {
    if (a === trimmed) return -1;
    if (b === trimmed) return 1;
    const da = levenshteinDistance(normalizeMatchText(trimmed), normalizeMatchText(a));
    const db = levenshteinDistance(normalizeMatchText(trimmed), normalizeMatchText(b));
    if (da !== db) return da - db;
    return a.length - b.length;
  });

  return ordered.slice(0, limit);
}

/** True when AI/corrected spelling is a plausible fix for the user-typed value. */
export function isPlausibleSpellingCorrection(typed: string, corrected: string): boolean {
  const a = typed.trim();
  const b = corrected.trim();
  if (!a || !b) return false;
  if (normalizeMatchText(a) === normalizeMatchText(b)) return true;
  if (textsLikelyMatch(a, b, { mode: "title" })) return true;
  if (textsLikelyMatch(a, b, { mode: "person" })) return true;

  const na = normalizeMatchText(a);
  const nb = normalizeMatchText(b);
  const dist = levenshteinDistance(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen <= 3) return dist === 0;
  if (maxLen <= 6) return dist <= 1;
  return dist <= Math.max(2, Math.floor(maxLen * 0.3));
}
