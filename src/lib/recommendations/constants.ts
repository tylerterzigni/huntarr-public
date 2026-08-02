/** Items shown per horizontal row on the home page. */
export const HOME_ROW_LIMIT = 40;

/** TMDB discover pages loaded on first paint (~20 results each → ~40 titles). */
export const DISCOVER_INITIAL_PAGES = 2;

/** Max discover grid items sent to the personalize-browse API (multi-page + load more). */
export const DISCOVER_PERSONALIZE_MAX = 150;

/** Extra candidates scored before trimming to row limit. */
export const FOR_YOU_CANDIDATE_POOL = 60;

/** Candidates sent to the AI reranker (match home row size for full AI ranking). */
export const FOR_YOU_RERANK_LIMIT = HOME_ROW_LIMIT;

/** Max similar/rec candidates kept per watch, library, or liked seed. */
export const FOR_YOU_ITEMS_PER_SEED = 6;

/** Max For You row slots attributed to a single seed title. */
export const FOR_YOU_MAX_PER_SEED_IN_ROW = 2;

/** Max trending/popular slots in the For You row (no personal seed). */
export const FOR_YOU_MAX_BROWSE_IN_ROW = 10;

/** Trending/popular titles merged into For You even when personal seeds exist. */
export const FOR_YOU_POPULAR_BROWSE_LIMIT = 20;

/** Leading row slots reserved for TMDB trending / popular picks. */
export const FOR_YOU_TRENDING_LEAD_SLOTS = 8;

/** Heuristic boosts for TMDB trending and popular browse candidates. */
export const FOR_YOU_TRENDING_SCORE_BOOST = 8;
export const FOR_YOU_POPULAR_SCORE_BOOST = 5;

/** Prior For You rows whose titles are suppressed on manual refresh. */
export const FOR_YOU_NO_REPEAT_ROW_COUNT = 4;

/** Default For You window — roughly the past few years (refresh count 0). */
export const FOR_YOU_RECENT_YEARS = 4;

/** Wider window after at least one manual refresh (refresh count 1). */
export const FOR_YOU_EXTENDED_YEARS = 15;

/** AI rerank batch size — each batch streams in as it completes. */
export const FOR_YOU_RERANK_CHUNK_SIZE = 5;

/** In-memory cache TTL for served For You rows. */
export const FOR_YOU_MEMORY_CACHE_TTL_MS = 5 * 60 * 1000;

/** DB cache TTL for AI-reranked For You rows (persists across page reloads). */
export const FOR_YOU_DB_CACHE_TTL_MS = 5 * 60 * 1000;

/** Watch-history seeds used for similar/recommendation TMDB calls. */
export const FOR_YOU_WATCH_SEED_LIMIT = 5;

/** Plex library seeds used for similar/recommendation TMDB calls. */
export const FOR_YOU_LIBRARY_SEED_LIMIT = 3;

/** Liked titles and people used as recommendation seeds. */
export const FOR_YOU_LIKED_SEED_LIMIT = 10;

/** Heuristic boost for Tautulli watch history and Plex library seeds (~60%). */
export const SEED_SCORE_BOOST = 12;

/** Heuristic boost for liked-list seeds (~40%). */
export const LIKED_SEED_SCORE_BOOST = 8;

/** Minimum TMDB rating when fetching quality-focused discover candidates. */
export const FOR_YOU_QUALITY_MIN_TMDB_RATING = 7;

/** Minimum TMDB vote count for quality discover (avoids obscure one-vote titles). */
export const FOR_YOU_QUALITY_MIN_VOTE_COUNT = 100;

/** Blend weights for final For You match % (personal AI vs TMDB/RT quality). */
export const FOR_YOU_PERSONAL_SCORE_WEIGHT = 0.65;
export const FOR_YOU_QUALITY_SCORE_WEIGHT = 0.35;

/** Concurrent Rotten Tomatoes lookups during For You scoring. */
export const FOR_YOU_RT_FETCH_CONCURRENCY = 5;

/** In-memory cache TTL for personalized browse rows (home page). */
export const PERSONALIZE_CACHE_TTL_MS = 5 * 60 * 1000;

/** AI rerank batches run in parallel after the first streamed chunk. */
export const PERSONALIZE_RERANK_PARALLEL = 3;

/** Home browse rows: one AI call on this many top picks (fast path). */
export const HOME_BROWSE_RERANK_LIMIT = 15;

/** TMDB discover pages fetched for chat browse-style search. */
export const CHAT_DISCOVER_PAGES = 5;

/** Candidates sent to AI reranking for chat results. */
export const CHAT_RERANK_POOL = 30;

/** Tautulli history pagination during sync. */
export const TAUTULLI_HISTORY_PAGE_SIZE = 1000;
export const TAUTULLI_HISTORY_MAX_RECORDS = 25000;
