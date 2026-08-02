export interface TmdbVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  size: number;
  type: string;
  official: boolean;
  published_at?: string;
  iso_639_1?: string;
}

export interface TmdbVideosResponse {
  results?: TmdbVideo[];
}

const TRAILER_TYPES = new Set(["Trailer", "Teaser"]);
const PROMO_TYPES = new Set(["Clip", "Featurette", "Behind the Scenes"]);

function videoPriority(video: TmdbVideo): number {
  const isYoutube = video.site === "YouTube";
  const isTrailer = video.type === "Trailer";
  const isTeaser = video.type === "Teaser";
  const isPromo = PROMO_TYPES.has(video.type);

  if (isYoutube && video.official && isTrailer) return 0;
  if (isYoutube && isTrailer) return 1;
  if (isYoutube && video.official && isTeaser) return 2;
  if (isYoutube && isTeaser) return 3;
  if (isYoutube && isPromo) return 4;
  if (isYoutube && TRAILER_TYPES.has(video.type)) return 5;

  if (video.official && isTrailer) return 10;
  if (isTrailer) return 11;
  if (video.official && isTeaser) return 12;
  if (isTeaser) return 13;
  if (isPromo) return 14;

  return 20;
}

function compareVideos(a: TmdbVideo, b: TmdbVideo): number {
  const priorityDiff = videoPriority(a) - videoPriority(b);
  if (priorityDiff !== 0) return priorityDiff;

  const sizeDiff = (b.size ?? 0) - (a.size ?? 0);
  if (sizeDiff !== 0) return sizeDiff;

  const aDate = a.published_at ? Date.parse(a.published_at) : 0;
  const bDate = b.published_at ? Date.parse(b.published_at) : 0;
  return bDate - aDate;
}

export function getVideoWatchUrl(video: TmdbVideo): string | null {
  switch (video.site) {
    case "YouTube":
      return `https://www.youtube.com/watch?v=${video.key}`;
    case "Vimeo":
      return `https://vimeo.com/${video.key}`;
    default:
      return null;
  }
}

export function pickBestTrailer(videos: TmdbVideo[] | undefined): TmdbVideo | null {
  if (!videos?.length) return null;

  const candidates = videos.filter((video) => getVideoWatchUrl(video) != null);
  if (!candidates.length) return null;

  return [...candidates].sort(compareVideos)[0] ?? null;
}

export function extractVideos(details: Record<string, unknown>): TmdbVideo[] {
  const videos = details.videos as TmdbVideosResponse | undefined;
  return videos?.results ?? [];
}
