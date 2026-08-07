import {
  compactMatchText,
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

const VOWELS = "aeiouy";

/** Prefer common confusions first (i/y), then the remaining vowels. */
const VOWEL_ALTERNATES: Record<string, string> = {
  a: "eoiuy",
  e: "aiouy",
  i: "yeoua",
  o: "aeiuy",
  u: "aeioy",
  y: "ieoua",
};

/** True when two queries differ only by whitespace (e.g. "cross road" vs "crossroad"). */
function isWhitespaceOnlyVariant(original: string, variant: string): boolean {
  return compactMatchText(original) === compactMatchText(variant);
}

/** Prefer balanced splits: "crossroad springs" over "cro ssroadsprings". */
function minTokenLength(value: string): number {
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 0;
  return Math.min(...parts.map((part) => part.length));
}

function preserveCaseReplace(original: string, index: number, nextChar: string): string {
  const current = original[index]!;
  const casing =
    current === current.toUpperCase() && current !== current.toLowerCase()
      ? nextChar.toUpperCase()
      : nextChar.toLowerCase();
  return original.slice(0, index) + casing + original.slice(index + 1);
}

/**
 * Bounded query variants for slight typos (swap / delete / doubled letters /
 * nearby keys / vowel swaps) plus space join/split for compound titles.
 * Keeps API fan-out small while recovering common misspellings.
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

  // Extra spaces in compound titles: "cross road springs" → "crossroad springs"
  if (words.length >= 2) {
    push(words.join(""));
    for (let i = 0; i < words.length - 1; i++) {
      const joined = [
        ...words.slice(0, i),
        words[i] + words[i + 1],
        ...words.slice(i + 2),
      ];
      push(joined.join(" "));
    }
    // Merge first N words for 3+ token queries: "cross road springs" → "crossroadsprings"
    // (already covered by full join) and pairwise chains of length 3.
    if (words.length >= 3) {
      for (let i = 0; i < words.length - 2; i++) {
        const joined = [
          ...words.slice(0, i),
          words[i] + words[i + 1] + words[i + 2],
          ...words.slice(i + 3),
        ];
        push(joined.join(" "));
      }
    }
  }

  // Missing spaces: "starwars" / "crossroadsprings" → try inserting a space.
  for (let w = 0; w < words.length; w++) {
    const word = words[w];
    if (word.length < 6) continue;
    let splitCount = 0;
    for (let i = 4; i <= word.length - 4 && splitCount < 12; i++) {
      const next = [...words];
      next.splice(w, 1, word.slice(0, i), word.slice(i));
      push(next.join(" "));
      splitCount += 1;
    }
  }

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

    // Vowel swaps: "grench" → "grinch", "bines" → "bynes"
    for (let i = 0; i < word.length; i++) {
      const ch = word[i]!.toLowerCase();
      const alternates = VOWEL_ALTERNATES[ch];
      if (!alternates) continue;
      for (const vowel of alternates) {
        replaceWord(preserveCaseReplace(word, i, vowel));
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
        replaceWord(preserveCaseReplace(word, i, neighbor));
        subCount += 1;
      }
    }

    // Common missing-letter inserts in likely slots (gervas → gervais)
    if (word.length >= 4 && word.length <= 14) {
      const slots: number[] = [];
      for (let i = 1; i < word.length; i++) {
        if (isLikelyMissingVowelSlot(word, i)) slots.push(i);
      }
      slots.sort((a, b) => {
      const rankDiff = missingVowelSlotRank(word, b) - missingVowelSlotRank(word, a);
      if (rankDiff !== 0) return rankDiff;
      return b - a; // prefer later slots (gerva|s over ge|rvas)
    });
      for (const i of slots) {
        for (const letter of VOWELS + "h") {
          replaceWord(word.slice(0, i) + letter + word.slice(i));
        }
      }
    }
  }

  // Prefer original, then whitespace-only variants (compound title spacing),
  // then closer edits — especially on longer content words ("gervas" over "ricky").
  const ordered = [...variants].sort((a, b) => {
    if (a === trimmed) return -1;
    if (b === trimmed) return 1;
    const aSpace = isWhitespaceOnlyVariant(trimmed, a);
    const bSpace = isWhitespaceOnlyVariant(trimmed, b);
    if (aSpace !== bSpace) return aSpace ? -1 : 1;
    if (aSpace && bSpace) {
      const minDiff = minTokenLength(b) - minTokenLength(a);
      if (minDiff !== 0) return minDiff;
    }
    const da = levenshteinDistance(normalizeMatchText(trimmed), normalizeMatchText(a));
    const db = levenshteinDistance(normalizeMatchText(trimmed), normalizeMatchText(b));
    if (da !== db) return da - db;
    const wordBiasA = longestChangedWordLength(trimmed, a);
    const wordBiasB = longestChangedWordLength(trimmed, b);
    if (wordBiasA !== wordBiasB) return wordBiasB - wordBiasA;
    // Prefer same-length substitutions ("grench"→"grinch") over deletions,
    // but keep single inserts (lenDiff 1) close so "gervas"→"gervais" survives.
    const lenDiffA = Math.abs(a.length - trimmed.length);
    const lenDiffB = Math.abs(b.length - trimmed.length);
    const softLenA = lenDiffA <= 1 ? 0 : lenDiffA;
    const softLenB = lenDiffB <= 1 ? 0 : lenDiffB;
    if (softLenA !== softLenB) return softLenA - softLenB;
    return a.length - b.length;
  });

  return ordered.slice(0, limit);
}

/** Length of the longest original token that differs in the variant. */
function longestChangedWordLength(original: string, variant: string): number {
  const a = original.toLowerCase().split(/\s+/).filter(Boolean);
  const b = variant.toLowerCase().split(/\s+/).filter(Boolean);
  if (a.length !== b.length) {
    return Math.max(...a.map((w) => w.length), 0);
  }
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    best = Math.max(best, a[i]!.length);
  }
  return best;
}

function pushWordEdits(
  words: string[],
  wordIndex: number,
  push: (value: string) => void
) {
  const word = words[wordIndex]!;
  if (word.length < 4) return;

  const replaceWord = (nextWord: string) => {
    const next = [...words];
    next[wordIndex] = nextWord;
    push(next.join(" "));
  };

  // Vowel inserts in likely slots — missing letters are common ("gervas" → "gervais")
  if (word.length >= 4 && word.length <= 14) {
    const slots: number[] = [];
    for (let i = 1; i < word.length; i++) {
      if (isLikelyMissingVowelSlot(word, i)) slots.push(i);
    }
    // Prefer after-vowel-before-consonant (gerva|s) over consonant clusters.
    slots.sort((a, b) => {
      const rankDiff = missingVowelSlotRank(word, b) - missingVowelSlotRank(word, a);
      if (rankDiff !== 0) return rankDiff;
      return b - a; // prefer later slots (gerva|s over ge|rvas)
    });
    for (const i of slots) {
      for (const letter of VOWELS + "h") {
        replaceWord(word.slice(0, i) + letter + word.slice(i));
      }
    }
  }

    // Vowel swaps: "grench" → "grinch", "bines" → "bynes"
    for (let i = 0; i < word.length; i++) {
      const ch = word[i]!.toLowerCase();
      const alternates = VOWEL_ALTERNATES[ch];
      if (!alternates) continue;
      for (const vowel of alternates) {
        replaceWord(preserveCaseReplace(word, i, vowel));
      }
    }

  // Adjacent letter swaps
  for (let i = 0; i < word.length - 1; i++) {
    replaceWord(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2));
  }

  // Single deletions
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
      replaceWord(preserveCaseReplace(word, i, neighbor));
      subCount += 1;
    }
  }
}

/** True for insert indexes where a missing vowel is plausible (not leading junk). */
function isLikelyMissingVowelSlot(word: string, index: number): boolean {
  if (index <= 0 || index >= word.length) return false;
  const left = word[index - 1]!.toLowerCase();
  const right = word[index]!.toLowerCase();
  const leftVowel = VOWELS.includes(left);
  const rightVowel = VOWELS.includes(right);
  // Between two consonants (godfther → godfather) or after a vowel before a consonant
  // (gervas → gervais).
  if (!leftVowel && !rightVowel) return true;
  if (leftVowel && !rightVowel) return true;
  return false;
}

function missingVowelSlotRank(word: string, index: number): number {
  const left = word[index - 1]!.toLowerCase();
  const right = word[index]!.toLowerCase();
  if (VOWELS.includes(left) && !VOWELS.includes(right)) return 2;
  if (!VOWELS.includes(left) && !VOWELS.includes(right)) return 1;
  return 0;
}

/**
 * Letter/spelling typo variants only (excludes space join/split).
 * Spreads the retry budget across content words so first-name edits
 * ("amanda …") cannot starve last-name fixes ("… bines" → "bynes").
 */
export function generateSpellingQueryVariants(query: string, limit = 12): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const words = trimmed.split(/\s+/).filter(Boolean);
  const significant = words
    .map((word, index) => ({ word, index }))
    .filter(({ word }) => word.length >= 4)
    // Longer words first; when lengths are close, prefer later tokens (surnames).
    .sort((a, b) => {
      const lenGap = b.word.length - a.word.length;
      if (Math.abs(lenGap) > 1) return lenGap;
      return b.index - a.index;
    });

  if (significant.length === 0) return [];

  const rankWordVariants = (wordVariants: string[], max: number): string[] => {
    const ordered = [...wordVariants].sort((a, b) => {
      const da = levenshteinDistance(normalizeMatchText(trimmed), normalizeMatchText(a));
      const db = levenshteinDistance(normalizeMatchText(trimmed), normalizeMatchText(b));
      if (da !== db) return da - db;
      const lenDiffA = Math.abs(a.length - trimmed.length);
      const lenDiffB = Math.abs(b.length - trimmed.length);
      if (lenDiffA !== lenDiffB) return lenDiffA - lenDiffB;
      return a.length - b.length;
    });

    const sameLen = ordered.filter((variant) => variant.length === trimmed.length);
    const inserts = ordered.filter((variant) => variant.length === trimmed.length + 1);
    const picked: string[] = [];
    const seen = new Set<string>();
    const take = (list: string[], n: number) => {
      let taken = 0;
      for (const variant of list) {
        if (picked.length >= max || taken >= n) break;
        if (seen.has(variant)) continue;
        seen.add(variant);
        picked.push(variant);
        taken += 1;
      }
    };

    const half = Math.max(1, Math.ceil(max / 2));
    take(sameLen, half);
    take(inserts, half);
    take(ordered, max);
    return picked;
  };

  const perWord = Math.max(3, Math.ceil(limit / significant.length));
  const result: string[] = [];
  const seen = new Set<string>();

  const collapsed = trimmed.replace(/([a-zA-Z])\1+/g, "$1");
  if (collapsed.toLowerCase() !== trimmed.toLowerCase() && collapsed.length > 1) {
    seen.add(collapsed);
    result.push(collapsed);
  }

  for (const { index } of significant) {
    if (result.length >= limit) break;
    const wordVariants: string[] = [];
    pushWordEdits(words, index, (value) => {
      if (value.toLowerCase() !== trimmed.toLowerCase()) wordVariants.push(value);
    });
    for (const variant of rankWordVariants(wordVariants, perWord)) {
      if (result.length >= limit) break;
      if (seen.has(variant)) continue;
      seen.add(variant);
      result.push(variant);
    }
  }

  return result.slice(0, limit);
}

/**
 * Variants that only change spacing (join/split compound titles).
 * Used even when the raw query already returns TMDB hits, so "lovelife"
 * still discovers "Love Life".
 */
export function generateWhitespaceQueryVariants(query: string, limit = 6): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return generateTypoQueryVariants(trimmed, Math.max(limit * 4, 16)).filter(
    (variant) =>
      variant.toLowerCase() !== trimmed.toLowerCase() &&
      isWhitespaceOnlyVariant(trimmed, variant)
  ).slice(0, limit);
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
