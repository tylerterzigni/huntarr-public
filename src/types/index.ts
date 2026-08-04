export type MediaType = "movie" | "tv";

export interface TmdbCreditPerson {
  id: number;
  name: string;
  profile_path?: string | null;
  character?: string;
  job?: string;
  department?: string;
  order?: number;
}

export interface TmdbMediaItem {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  media_type?: MediaType;
  genre_ids?: number[];
  original_language?: string;
  origin_country?: string[];
  popularity?: number;
  vote_count?: number;
}

export interface TmdbPersonSearchResult {
  id: number;
  name: string;
  popularity?: number;
  profile_path?: string | null;
  known_for_department?: string;
  known_for?: TmdbMediaItem[];
}

export interface SearchCriteria {
  genres?: number[];
  keywords?: string[];
  withKeywords?: string;
  yearMin?: number;
  yearMax?: number;
  dateMin?: string;
  dateMax?: string;
  minRating?: number;
  runtimeMin?: number;
  runtimeMax?: number;
  language?: string;
  mediaType?: MediaType | "all";
  withCast?: number[];
  withCrew?: number[];
  withPerson?: {
    tmdbId: number;
    name: string;
    creditType: "cast" | "crew" | "both";
    crewRole?: "creator";
  };
  withPersonUnresolved?: string;
  excludeWatched?: boolean;
  excludeInLibrary?: boolean;
  excludeHidden?: boolean;
  mood?: string;
  moreLike?: { tmdbId: number; mediaType: MediaType; title: string };
  moreLikeUnresolved?: string;
  exclusions?: string[];
}

export interface RecommendationItem extends TmdbMediaItem {
  score?: number;
  reason?: string;
  inLibrary?: boolean;
  watched?: boolean;
  fullyWatched?: boolean;
  hidden?: boolean;
}

export interface ArrCredentials {
  apiKey: string;
}

export interface PlexCredentials {
  token: string;
}

export interface TautulliCredentials {
  apiKey: string;
}

export interface IntegrationConfig {
  defaultQualityProfileId?: number;
  defaultRootFolder?: string;
  defaultLanguageProfileId?: number;
  defaultSeriesType?: string;
  defaultMonitor?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: string;
  items?: RecommendationItem[];
}

export interface ArrAddRequest {
  instanceId: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  qualityProfileId?: number;
  rootFolder?: string;
  languageProfileId?: number;
  seriesType?: string;
  monitor?: string;
  /** Season numbers to monitor when adding a series (specials = 0 omitted unless included). */
  seasons?: number[];
}
