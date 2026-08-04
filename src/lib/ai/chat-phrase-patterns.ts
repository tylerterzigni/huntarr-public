/** TMDB genre names and related chat phrase patterns (plurals, synonyms, slang). */

export interface GenrePhraseRule {
  /** Any pattern matching activates this rule. */
  patterns: RegExp[];
  genres: string[];
  keywords?: string[];
  /** When set, suggests this media type for the query. */
  mediaType?: "movie" | "tv";
  /** Stand-up and similar rules replace generic comedy detection. */
  exclusive?: boolean;
}

export const GENRE_PHRASE_RULES: GenrePhraseRule[] = [
  {
    patterns: [/\bsitcoms?\b/i],
    genres: ["Comedy"],
    keywords: ["sitcom"],
    mediaType: "tv",
    exclusive: true,
  },
  {
    patterns: [
      /\bstand[\s-]?up(?:\s+comedy)?\b/i,
      /\bstand[\s-]?up specials?\b/i,
      /\bcomedy specials?\b/i,
    ],
    genres: ["Stand-Up Comedy"],
    mediaType: "movie",
    exclusive: true,
  },
  {
    patterns: [
      /\bchick flicks?\b/i,
      /\bromantic comed(y|ies)\b/i,
      /\brom-?coms?\b/i,
      /\bromcoms?\b/i,
    ],
    genres: ["Comedy", "Romance"],
    keywords: ["romantic comedy"],
  },
  {
    patterns: [
      /\bcomed(y|ies)\b/i,
      /\bfunny\b/i,
      /\bhilarious\b/i,
      /\blaughs?\b/i,
      /\bamusing\b/i,
    ],
    genres: ["Comedy"],
  },
  {
    patterns: [
      /\bromances?\b/i,
      /\bromantic\b/i,
      /\blove stor(y|ies)\b/i,
    ],
    genres: ["Romance"],
  },
  {
    patterns: [
      /\bsci[\s-]?fi\b/i,
      /\bscience fiction\b/i,
      /\bscience-fiction\b/i,
      /\bsci fi\b/i,
    ],
    genres: ["Science Fiction"],
  },
  {
    patterns: [
      /\bhorrors?\b/i,
      /\bscary (?:movies?|films?|shows?)\b/i,
      /\bspine-?chilling\b/i,
      /\bscary\b/i,
    ],
    genres: ["Horror"],
  },
  {
    patterns: [/\bthrillers?\b/i, /\bsuspense\b/i],
    genres: ["Thriller"],
  },
  {
    patterns: [/\bdramas?\b/i],
    genres: ["Drama"],
  },
  {
    patterns: [/\bactions?\b/i, /\baction-packed\b/i],
    genres: ["Action"],
  },
  {
    patterns: [/\bfantas(y|ies)\b/i],
    genres: ["Fantasy"],
  },
  {
    patterns: [/\bcrimes?\b/i, /\btrue crime\b/i],
    genres: ["Crime"],
  },
  {
    patterns: [/\bdocumentaries\b/i, /\bdocumentary\b/i, /\bdocuseries\b/i],
    genres: ["Documentary"],
  },
  {
    patterns: [
      /\banimations?\b/i,
      /\banimated\b/i,
      /\bcartoons?\b/i,
      /\banime\b/i,
    ],
    genres: ["Animation"],
  },
  {
    patterns: [/\bfamil(y|ies)\b/i, /\bkids?\b/i, /\bfamily-friendly\b/i],
    genres: ["Family"],
  },
  {
    patterns: [/\bmysteries?\b/i, /\bwhodunits?\b/i],
    genres: ["Mystery"],
  },
  {
    patterns: [/\bwesterns?\b/i],
    genres: ["Western"],
  },
  {
    patterns: [/\bwar films?\b/i, /\bwar movies?\b/i, /\bwar shows?\b/i],
    genres: ["War"],
  },
];

export const MEDIA_TYPE_TV_PATTERNS: RegExp[] = [
  /\bsitcoms?\b/i,
  /\btv shows?\b/i,
  /\btv series\b/i,
  /\btelevision\b/i,
  /\bminiseries\b/i,
  /\bmini-series\b/i,
  /\b(?:tv|television) dramas?\b/i,
  /\bseries\b/i,
  /\bshow(s)?\b/i,
];

export const MEDIA_TYPE_MOVIE_PATTERNS: RegExp[] = [
  /\bmovies?\b/i,
  /\bfilms?\b/i,
  /\bflicks?\b/i,
  /\bmotion pictures?\b/i,
  /\bfeature films?\b/i,
];

export const MOOD_PHRASE_RULES: Array<{ patterns: RegExp[]; mood: string }> = [
  {
    patterns: [/\bfunny\b/i, /\bhilarious\b/i, /\blighthearted\b/i, /\blight-hearted\b/i],
    mood: "funny and lighthearted",
  },
  {
    patterns: [/\bchick flicks?\b/i, /\brom-?coms?\b/i, /\bromantic comed(y|ies)\b/i],
    mood: "romantic comedy",
  },
  {
    patterns: [/\bgritty\b/i, /\bdark\b/i, /\bintense\b/i, /\bnoir\b/i],
    mood: "gritty and intense",
  },
  {
    patterns: [/\bfeel-?good\b/i, /\buplifting\b/i, /\bheartwarming\b/i],
    mood: "feel-good",
  },
  {
    patterns: [/\bscary\b/i, /\bspooky\b/i, /\bcreepy\b/i, /\bterrifying\b/i],
    mood: "scary",
  },
];

export const KEYWORD_PHRASE_RULES: Array<{ patterns: RegExp[]; keyword: string }> = [
  { patterns: [/\bsitcoms?\b/i], keyword: "sitcom" },
  { patterns: [/\bchick flicks?\b/i], keyword: "romantic comedy" },
  { patterns: [/\bheists?\b/i], keyword: "heist" },
  { patterns: [/\btime travel\b/i], keyword: "time travel" },
  { patterns: [/\bsuperhero(es)?\b/i], keyword: "superhero" },
  { patterns: [/\bzombies?\b/i], keyword: "zombie" },
  { patterns: [/\bvampires?\b/i], keyword: "vampire" },
  { patterns: [/\b(?:weed|marijuana|cannabis|pot)\b/i], keyword: "marijuana" },
  {
    patterns: [/\bchristmas\b/i, /\bxmas\b/i, /\bholiday(?:s)?\s+(?:movies?|films?)\b/i],
    keyword: "christmas",
  },
  { patterns: [/\bhalloween\b/i], keyword: "halloween" },
];

/** Expand common theme terms to related TMDB keyword searches. */
const THEME_KEYWORD_SYNONYMS: Record<string, string[]> = {
  weed: ["marijuana", "cannabis", "weed"],
  marijuana: ["marijuana", "cannabis", "weed"],
  cannabis: ["cannabis", "marijuana", "weed"],
  pot: ["marijuana", "cannabis"],
};

function cleanThemeCapture(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(?:find|show|get)\s+(?:me\s+)?/i, "")
    .replace(/^(?:the|a|an)\s+/i, "")
    .replace(/\s+(?:shows?|movies?|series|films?|tv)\s*$/i, "")
    .trim();
}

function expandThemeTerms(term: string): string[] {
  const cleaned = cleanThemeCapture(term);
  if (!cleaned || cleaned.length < 2) return [];
  const key = cleaned.toLowerCase();
  const synonyms = THEME_KEYWORD_SYNONYMS[key];
  if (synonyms) return [...new Set(synonyms)];
  return [cleaned];
}

export function isThemeTopicQuery(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /\b(?:shows?|movies?|series|films?)\s+about\b/.test(lower) ||
    /\b(?:find|show|get)\s+(?:me\s+)?(?:shows?|movies?|series|films?)\s+about\b/.test(lower) ||
    /\b(?:find|show|get)\s+(?:me\s+)?\S+(?:\s+\S+)?\s+related\s+(?:shows?|movies?|series|films?)\b/.test(
      lower
    ) ||
    /\brelated\s+(?:shows?|movies?|series|films?)\b/.test(lower) ||
    /\b(?:involving|dealing with|on the topic of|featuring themes? of)\b/.test(lower)
  );
}

export function extractThemeKeywordsFromMessage(message: string): string[] {
  const patterns = [
    /(?:shows?|movies?|series|films?)\s+about\s+(.+?)\s*$/i,
    /(?:find|show|get)\s+(?:me\s+)?(?:shows?|movies?|series|films?)\s+about\s+(.+?)\s*$/i,
    /(?:find|show|get)\s+(?:me\s+)?(.+?)\s+related\s+(?:shows?|movies?|series|films?)\s*$/i,
  ];

  const terms = new Set<string>();
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (!match?.[1]) continue;
    for (const term of expandThemeTerms(match[1])) {
      terms.add(term);
    }
  }

  return [...terms];
}

export const HIGH_RATING_PATTERNS: RegExp[] = [
  /\bhigh ratings?\b/i,
  /\bhighly rated\b/i,
  /\bwell reviewed\b/i,
  /\bwell-reviewed\b/i,
  /\btop rated\b/i,
  /\btop-rated\b/i,
  /\bbest rated\b/i,
  /\bcritically acclaimed\b/i,
  /\bgreat reviews?\b/i,
  /\bacclaimed\b/i,
];

export const RECENT_DATE_PATTERNS: RegExp[] = [
  /\bnewer\b/i,
  /\brecent(ly)?\b/i,
  /\blatest\b/i,
  /\bnewest\b/i,
  /\bjust released\b/i,
  /\bjust came out\b/i,
  /\bbrand new\b/i,
  /\bfresh releases?\b/i,
  /\blately\b/i,
  /\bnew releases?\b/i,
];

export function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function isShowMePhrase(text: string): boolean {
  return /\bshow me\b/i.test(text);
}

/** Person-scoped queries: "shows with X", "show me shows with X", "movies with X". */
export function inferMediaTypeFromPersonQuery(message: string): "movie" | "tv" | undefined {
  const lower = message.toLowerCase();
  if (
    /\b(?:movies?|films?|flicks?)\s+(?:with|by|from|starring|featuring)\b/i.test(lower) ||
    /\b(?:find|show|get)\s+(?:me\s+)?(?:movies?|films?)\s+(?:with|by|from|starring|featuring)\b/i.test(
      lower
    )
  ) {
    return "movie";
  }
  if (
    /\b(?:shows?|series|sitcoms?)\s+(?:with|by|from|starring|featuring|created by|written by|directed by)\b/i.test(
      lower
    ) ||
    /\b(?:find|show|get)\s+(?:me\s+)?(?:tv\s+)?(?:shows?|series|sitcoms?)\s+(?:with|by|from|starring|featuring)\b/i.test(
      lower
    )
  ) {
    return "tv";
  }
  return undefined;
}

export function shouldMatchTvMediaType(lower: string): boolean {
  if (inferMediaTypeFromPersonQuery(lower) === "tv") return true;

  if (isShowMePhrase(lower)) {
    return (
      matchesAny(lower, [
        /\bsitcoms?\b/i,
        /\btv shows?\b/i,
        /\btv series\b/i,
        /\btelevision\b/i,
        /\bshow me\s+(?:tv\s+)?shows?\b/i,
      ]) ||
      (/\bseries\b/i.test(lower) && !/\bmini-series\b/i.test(lower))
    );
  }
  return matchesAny(lower, MEDIA_TYPE_TV_PATTERNS);
}

export function shouldMatchMovieMediaType(lower: string): boolean {
  if (inferMediaTypeFromPersonQuery(lower) === "movie") return true;
  return matchesAny(lower, MEDIA_TYPE_MOVIE_PATTERNS);
}

export function applyGenrePhraseRules(
  lower: string,
  genres: string[],
  keywords: string[],
  criteria: Record<string, unknown>
): void {
  let comedyBlocked = false;

  for (const rule of GENRE_PHRASE_RULES) {
    if (!matchesAny(lower, rule.patterns)) continue;

    if (rule.exclusive) {
      comedyBlocked = true;
    }
    if (comedyBlocked && rule.genres.includes("Comedy") && !rule.exclusive) {
      continue;
    }

    // Skip generic drama when user asked for romantic drama / romantic comedy
    if (
      rule.genres.includes("Drama") &&
      rule.genres.length === 1 &&
      /\bromantic drama\b/i.test(lower)
    ) {
      continue;
    }

    genres.push(...rule.genres);
    if (rule.keywords) keywords.push(...rule.keywords);
    if (rule.mediaType && !criteria.mediaType) {
      criteria.mediaType = rule.mediaType;
    }
  }
}

export interface DateRange {
  dateMin: string;
  dateMax: string;
}

export function parseRelativeDateRange(lower: string, today = new Date()): DateRange | null {
  const isoToday = today.toISOString().slice(0, 10);

  const monthsMatch =
    lower.match(/(?:past|last|previous|recent)\s+(\d+)\s+months?/) ??
    lower.match(/(?:within|in|over|during)\s+(?:the\s+)?(?:past|last)\s+(\d+)\s+months?/);
  const weeksMatch =
    lower.match(/(?:past|last|previous|recent)\s+(\d+)\s+weeks?/) ??
    lower.match(/(?:within|in|over|during)\s+(?:the\s+)?(?:past|last)\s+(\d+)\s+weeks?/);
  const daysMatch =
    lower.match(/(?:past|last|previous|recent)\s+(\d+)\s+days?/) ??
    lower.match(/(?:within|in|over|during)\s+(?:the\s+)?(?:past|last)\s+(\d+)\s+days?/);
  const yearsMatch =
    lower.match(/(?:past|last|previous|recent)\s+(\d+)\s+years?/) ??
    lower.match(/(?:within|in|over|during)\s+(?:the\s+)?(?:past|last)\s+(\d+)\s+years?/);

  if (monthsMatch) {
    const dateMin = new Date(today);
    dateMin.setMonth(dateMin.getMonth() - parseInt(monthsMatch[1], 10));
    return { dateMin: dateMin.toISOString().slice(0, 10), dateMax: isoToday };
  }
  if (weeksMatch) {
    const dateMin = new Date(today);
    dateMin.setDate(dateMin.getDate() - parseInt(weeksMatch[1], 10) * 7);
    return { dateMin: dateMin.toISOString().slice(0, 10), dateMax: isoToday };
  }
  if (daysMatch) {
    const dateMin = new Date(today);
    dateMin.setDate(dateMin.getDate() - parseInt(daysMatch[1], 10));
    return { dateMin: dateMin.toISOString().slice(0, 10), dateMax: isoToday };
  }
  if (yearsMatch) {
    const years = parseInt(yearsMatch[1], 10);
    const startYear = today.getFullYear() - years;
    return { dateMin: `${startYear}-01-01`, dateMax: isoToday };
  }

  if (
    matchesAny(lower, [
      /\b(?:past|last|previous|recent)\s+week\b/i,
      /\bthis week\b/i,
      /\bfrom this week\b/i,
      /\bin the last week\b/i,
      /\bover the past week\b/i,
    ])
  ) {
    const dateMin = new Date(today);
    dateMin.setDate(dateMin.getDate() - 7);
    return { dateMin: dateMin.toISOString().slice(0, 10), dateMax: isoToday };
  }

  if (
    matchesAny(lower, [
      /\b(?:past|last|previous|recent)\s+month\b/i,
      /\bthis month\b/i,
      /\bfrom this month\b/i,
      /\bin the last month\b/i,
      /\bover the past month\b/i,
    ])
  ) {
    const dateMin = new Date(today);
    dateMin.setMonth(dateMin.getMonth() - 1);
    return { dateMin: dateMin.toISOString().slice(0, 10), dateMax: isoToday };
  }

  if (
    matchesAny(lower, [
      /\bthis year\b/i,
      /\bfrom this year\b/i,
      /\breleased this year\b/i,
      /\b(?:past|last)\s+year\b/i,
    ])
  ) {
    if (/\b(?:past|last)\s+year\b/i.test(lower)) {
      const dateMin = new Date(today);
      dateMin.setFullYear(dateMin.getFullYear() - 1);
      return { dateMin: dateMin.toISOString().slice(0, 10), dateMax: isoToday };
    }
    return { dateMin: `${today.getFullYear()}-01-01`, dateMax: isoToday };
  }

  if (matchesAny(lower, RECENT_DATE_PATTERNS) || /\bnew\b/i.test(lower)) {
    const dateMin = new Date(today);
    dateMin.setMonth(dateMin.getMonth() - 3);
    return { dateMin: dateMin.toISOString().slice(0, 10), dateMax: isoToday };
  }

  const absoluteYear = parseAbsoluteYearRange(lower);
  if (absoluteYear) return absoluteYear;

  return null;
}

/** "from 2026", "in 2026", "2026 movies", "2010-2020", "1990s", "between 2000 and 2010". */
export function parseAbsoluteYearRange(lower: string): DateRange | null {
  const betweenMatch = lower.match(
    /\b(?:between|from)\s+((?:19|20)\d{2})\s+(?:and|to|through|-|–|—)\s+((?:19|20)\d{2})\b/
  );
  if (betweenMatch) {
    let a = parseInt(betweenMatch[1], 10);
    let b = parseInt(betweenMatch[2], 10);
    if (a > b) [a, b] = [b, a];
    if (a < 1888 || b > 2100) return null;
    return { dateMin: `${a}-01-01`, dateMax: `${b}-12-31` };
  }

  const dashRange = lower.match(/\b((?:19|20)\d{2})\s*[-–—]\s*((?:19|20)\d{2})\b/);
  if (dashRange) {
    let a = parseInt(dashRange[1], 10);
    let b = parseInt(dashRange[2], 10);
    if (a > b) [a, b] = [b, a];
    if (a < 1888 || b > 2100) return null;
    return { dateMin: `${a}-01-01`, dateMax: `${b}-12-31` };
  }

  const decadeMatch =
    lower.match(/\b((?:19|20)\d)0s\b/) ??
    lower.match(/\b((?:19|20)\d)0'?s\b/) ??
    lower.match(/\b(?:the\s+)?((?:19|20)\d)0s\s+(?:movies?|films?|shows?|series)\b/);
  if (decadeMatch) {
    const decadeStart = parseInt(`${decadeMatch[1]}0`, 10);
    if (decadeStart < 1880 || decadeStart > 2090) return null;
    return { dateMin: `${decadeStart}-01-01`, dateMax: `${decadeStart + 9}-12-31` };
  }

  const yearMatch =
    lower.match(
      /\b(?:from|in|during|of|for|released(?:\s+in)?|came out(?:\s+in)?|aired(?:\s+in)?|premiered(?:\s+in)?)\s+(?:the\s+year\s+)?((?:19|20)\d{2})\b/
    ) ??
    lower.match(/\b((?:19|20)\d{2})\s+(?:movies?|films?|shows?|series|releases?)\b/) ??
    lower.match(/\b(?:movies?|films?|shows?|series)\s+(?:from|in|of|released\s+in)\s+((?:19|20)\d{2})\b/);

  if (!yearMatch) return null;
  const year = parseInt(yearMatch[1], 10);
  if (year < 1888 || year > 2100) return null;
  return { dateMin: `${year}-01-01`, dateMax: `${year}-12-31` };
}
