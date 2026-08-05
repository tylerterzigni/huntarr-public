"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn, formatAirDate, stillUrl, episodeAvailabilityKey } from "@/lib/utils";
import type { SeasonAvailabilityStatus } from "@/lib/integrations/arr/availability";

export interface TmdbSeasonSummary {
  season_number: number;
  episode_count: number;
  name?: string;
}

interface TmdbEpisode {
  episode_number: number;
  name: string;
  overview?: string;
  air_date?: string;
  still_path?: string | null;
}

interface SeasonsSectionProps {
  tmdbId: number;
  seasons: TmdbSeasonSummary[];
  episodeAvailability: string[];
  /** Season-level status from Sonarr + TMDB episode counts. */
  seasonAvailability?: Record<number, SeasonAvailabilityStatus>;
}

function AvailabilityBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-medium text-white">
      {label}
    </span>
  );
}

function SeasonStatusBadge({ status }: { status: SeasonAvailabilityStatus | null }) {
  if (status === "available") {
    return <AvailabilityBadge label="Available" />;
  }
  if (status === "partial") {
    return <AvailabilityBadge label="Partially Available" />;
  }
  return null;
}

/** Derive status from episode hasFile keys vs TMDB episode_count. */
function getSeasonAvailabilityFromEpisodes(
  seasonNumber: number,
  episodeCount: number,
  availability: Set<string>
): SeasonAvailabilityStatus | null {
  if (episodeCount <= 0) return null;

  let availableCount = 0;
  for (let episode = 1; episode <= episodeCount; episode++) {
    if (availability.has(episodeAvailabilityKey(seasonNumber, episode))) {
      availableCount++;
    }
  }

  if (availableCount === 0) return null;
  if (availableCount >= episodeCount) return "available";
  return "partial";
}

/** Prefer Partially Available when server stats and episode keys disagree. */
function resolveSeasonStatus(
  fromServer: SeasonAvailabilityStatus | undefined,
  fromEpisodes: SeasonAvailabilityStatus | null
): SeasonAvailabilityStatus | null {
  if (fromServer === "partial" || fromEpisodes === "partial") return "partial";
  if (fromServer === "available" || fromEpisodes === "available") return "available";
  return null;
}

export function SeasonsSection({
  tmdbId,
  seasons,
  episodeAvailability,
  seasonAvailability = {},
}: SeasonsSectionProps) {
  const availability = new Set(episodeAvailability);
  const regularSeasons = seasons
    .filter((season) => season.season_number > 0)
    .sort((a, b) => b.season_number - a.season_number);

  const [expandedSeason, setExpandedSeason] = useState<number | null>(null);
  const [loadedSeasons, setLoadedSeasons] = useState<Record<number, TmdbEpisode[]>>({});
  const [loadingSeason, setLoadingSeason] = useState<number | null>(null);

  if (regularSeasons.length === 0) return null;

  async function toggleSeason(seasonNumber: number) {
    if (expandedSeason === seasonNumber) {
      setExpandedSeason(null);
      return;
    }

    setExpandedSeason(seasonNumber);

    if (loadedSeasons[seasonNumber]) return;

    setLoadingSeason(seasonNumber);
    try {
      const res = await fetch(`/api/tmdb/tv/${tmdbId}/season/${seasonNumber}`);
      if (res.ok) {
        const data = await res.json();
        const episodes = (data.episodes as TmdbEpisode[]) ?? [];
        setLoadedSeasons((prev) => ({ ...prev, [seasonNumber]: episodes }));
      }
    } finally {
      setLoadingSeason(null);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Seasons</h2>
      <div className="space-y-3">
        {regularSeasons.map((season) => {
          const isExpanded = expandedSeason === season.season_number;
          const seasonStatus = resolveSeasonStatus(
            seasonAvailability[season.season_number],
            getSeasonAvailabilityFromEpisodes(
              season.season_number,
              season.episode_count,
              availability
            )
          );
          const episodes = loadedSeasons[season.season_number] ?? [];

          return (
            <div
              key={season.season_number}
              className="overflow-hidden rounded-lg border border-gray-300/70 bg-white/40 shadow-none backdrop-blur-md"
            >
              <button
                type="button"
                onClick={() => toggleSeason(season.season_number)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-seerr-hover/50 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="font-semibold text-gray-900">
                    {season.name ?? `Season ${season.season_number}`}
                  </span>
                  <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                    {season.episode_count} Episode{season.episode_count === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <SeasonStatusBadge status={seasonStatus} />
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-800">
                  {loadingSeason === season.season_number && (
                    <p className="px-4 py-6 text-sm text-muted-foreground">Loading episodes...</p>
                  )}
                  {episodes.map((episode, index) => {
                    const isAvailable = availability.has(
                      episodeAvailabilityKey(season.season_number, episode.episode_number)
                    );
                    const thumbnail = stillUrl(episode.still_path);

                    return (
                      <div
                        key={episode.episode_number}
                        className={cn(
                          "flex gap-4 px-4 py-4",
                          index < episodes.length - 1 && "border-b border-gray-800"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-gray-900">
                              {episode.episode_number} - {episode.name}
                            </h3>
                            {episode.air_date && (
                              <span className="rounded border border-gray-300/70 bg-white/40 px-2 py-0.5 text-xs text-gray-600 backdrop-blur-md">
                                {formatAirDate(episode.air_date)}
                              </span>
                            )}
                            {isAvailable && <AvailabilityBadge label="Available" />}
                          </div>
                          {episode.overview && (
                            <p className="mt-2 text-sm text-gray-400 leading-relaxed">
                              {episode.overview}
                            </p>
                          )}
                        </div>
                        {thumbnail && (
                          <div className="relative hidden sm:block w-[180px] h-[101px] shrink-0">
                            <Image
                              src={thumbnail}
                              alt={episode.name}
                              fill
                              className="rounded-md object-cover"
                              sizes="180px"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
