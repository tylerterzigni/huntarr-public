"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { backdropUrl, formatRuntime, formatYear, posterUrl } from "@/lib/utils";
import { ArrAddModal } from "@/components/arr/ArrAddModal";
import { CastCrewSection } from "@/components/media/CastCrewSection";
import { KeywordsSection } from "@/components/media/KeywordsSection";
import { MediaInfoBox } from "@/components/media/MediaInfoBox";
import { SeasonsSection, type TmdbSeasonSummary } from "@/components/media/SeasonsSection";
import { useDetailNavContrast } from "@/components/providers/DetailNavContrastProvider";
import { dispatchTitleHidden } from "@/lib/hide-list/client";
import { extractVideos, getVideoWatchUrl, pickBestTrailer } from "@/lib/integrations/tmdb/trailer";
import type { SeasonAvailabilityStatus } from "@/lib/integrations/arr/availability";
import type { MediaType, TmdbCreditPerson } from "@/types";
import type { RTRatings } from "@/lib/integrations/rottentomatoes/client";

interface TitleDetailClientProps {
  details: Record<string, unknown>;
  mediaType: MediaType;
  tmdbId: number;
  inLibrary: boolean;
  /** True when the title is already in Radarr/Sonarr. */
  inArr?: boolean;
  inPlex: boolean;
  plexPlayUrl?: string | null;
  watched: boolean;
  isHidden: boolean;
  isLiked: boolean;
  isReminded?: boolean;
  isAdmin: boolean;
  watchRegion?: string;
  rtRatings?: RTRatings | null;
  keywords?: Array<{ id: number; name: string }>;
  seasons?: TmdbSeasonSummary[];
  episodeAvailability?: string[];
  seasonAvailability?: Record<number, SeasonAvailabilityStatus>;
}
export function TitleDetailClient({
  details,
  mediaType,
  tmdbId,
  inLibrary,
  inArr = false,
  inPlex,
  plexPlayUrl,
  watched,
  isHidden,
  isLiked,
  isReminded = false,
  isAdmin,
  watchRegion = "US",
  rtRatings,
  keywords = [],
  seasons = [],
  episodeAvailability = [],
  seasonAvailability = {},
}: TitleDetailClientProps) {
  const [arrOpen, setArrOpen] = useState(false);
  const { reportBackdropUrl, reportBackdropElement } = useDetailNavContrast();
  const title = (details.title ?? details.name) as string;
  const overview = details.overview as string;
  const backdrop = backdropUrl(details.backdrop_path as string);

  useEffect(() => {
    reportBackdropUrl(backdrop);
    return () => {
      reportBackdropUrl(null);
      reportBackdropElement(null);
    };
  }, [backdrop, reportBackdropUrl, reportBackdropElement]);

  const setBackdropNode = useCallback(
    (node: HTMLDivElement | null) => {
      reportBackdropElement(node);
    },
    [reportBackdropElement]
  );

  const runtime = details.runtime as number | undefined;
  const episodeRunTime = (details.episode_run_time as number[])?.[0];
  const lastEpisodeRuntime = (details.last_episode_to_air as { runtime?: number } | undefined)
    ?.runtime;
  const displayRuntime = runtime ?? episodeRunTime ?? lastEpisodeRuntime;
  const genres = (details.genres as Array<{ name: string }>) ?? [];
  const credits = details.credits as
    | { cast?: TmdbCreditPerson[]; crew?: TmdbCreditPerson[] }
    | undefined;
  const tagline = details.tagline as string | undefined;
  const trailer = pickBestTrailer(extractVideos(details));
  const trailerUrl = trailer ? getVideoWatchUrl(trailer) : null;
  const seasonCount =
    mediaType === "tv"
      ? seasons.filter((season) => season.season_number > 0).length
      : 0;

  async function hideItem(scope: "global" | "user") {
    const res = await fetch("/api/hide-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId, mediaType, title, scope }),
    });
    if (!res.ok && res.status !== 409) return;

    dispatchTitleHidden({ tmdbId, mediaType });
    window.location.href = "/";
  }

  return (
    <>
      {backdrop && (
        <div
          ref={setBackdropNode}
          className="relative -mt-[7.5rem] pt-[7.5rem] md:-mt-20 md:pt-20 h-[340px] md:h-[440px] lg:h-[min(42vh,540px)] w-full overflow-hidden bg-seerr-bg"
        >
          <Image
            src={backdrop}
            alt=""
            fill
            className="object-cover object-[center_25%]"
            priority
            quality={90}
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-seerr-bg via-seerr-bg/50 to-transparent" />
        </div>
      )}
      <div className="relative z-10 -mt-44 md:-mt-48 px-4 pb-12 md:px-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-8 md:flex-row">
              <div className="relative mx-auto w-[200px] flex-shrink-0 md:mx-0">
                <Image
                  src={posterUrl(details.poster_path as string, "w500")}
                  alt={title}
                  width={200}
                  height={300}
                  className="rounded-lg shadow-2xl"
                />
              </div>
              <div className="flex-1">
                <h1 className="text-3xl font-bold md:text-4xl">{title}</h1>
                <div className="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <span>{formatYear((details.release_date ?? details.first_air_date) as string)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {inLibrary && (
                    <span className="rounded bg-emerald-600/90 px-2 py-1 text-xs font-medium">
                      In Library
                    </span>
                  )}
                  {watched && (
                    <span className="rounded bg-blue-600/90 px-2 py-1 text-xs font-medium">
                      Watched
                    </span>
                  )}
                  {isHidden && (
                    <span className="rounded bg-gray-600/90 px-2 py-1 text-xs font-medium">
                      Hidden
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
                  {displayRuntime && <span>{formatRuntime(displayRuntime)}</span>}
                  {displayRuntime && (seasonCount > 0 || genres.length > 0) && (
                    <span className="text-gray-600" aria-hidden>
                      |
                    </span>
                  )}
                  {seasonCount > 0 && (
                    <span>
                      {seasonCount} Season{seasonCount === 1 ? "" : "s"}
                    </span>
                  )}
                  {seasonCount > 0 && genres.length > 0 && (
                    <span className="text-gray-600" aria-hidden>
                      |
                    </span>
                  )}
                  {genres.map((genre, index) => (
                    <span key={genre.name}>
                      {index > 0 && ", "}
                      {genre.name}
                    </span>
                  ))}
                </div>
                {tagline && (
                  <p className="mt-3 text-sm italic text-gray-500">&ldquo;{tagline}&rdquo;</p>
                )}
                <p className="mt-4 max-w-3xl leading-relaxed text-gray-700">{overview}</p>
                <CastCrewSection cast={credits?.cast} crew={credits?.crew} />
              </div>
            </div>

            {mediaType === "tv" && (
              <div className="mt-2">
                <KeywordsSection keywords={keywords} mediaType={mediaType} />
                <div className="w-full lg:w-3/4">
                  <SeasonsSection
                    tmdbId={tmdbId}
                    seasons={seasons}
                    episodeAvailability={episodeAvailability}
                    seasonAvailability={seasonAvailability}
                  />
                </div>
              </div>
            )}
          </div>

          <MediaInfoBox
            mediaType={mediaType}
            tmdbId={tmdbId}
            title={title}
            details={details}
            watchRegion={watchRegion}
            rtRatings={rtRatings}
            inLibrary={inLibrary}
            inArr={inArr}
            inPlex={inPlex}
            plexPlayUrl={plexPlayUrl}
            isHidden={isHidden}
            isLiked={isLiked}
            isReminded={isReminded}
            isAdmin={isAdmin}
            trailerUrl={trailerUrl}
            onAddToArr={() => setArrOpen(true)}
            onHideUser={() => hideItem("user")}
            onHideGlobal={() => hideItem("global")}
          />
        </div>
      </div>
      <ArrAddModal
        open={arrOpen}
        onOpenChange={setArrOpen}
        tmdbId={tmdbId}
        mediaType={mediaType}
        title={title}
        backdropPath={details.backdrop_path as string | null | undefined}
        seasons={seasons}
        episodeAvailability={episodeAvailability}
        seasonAvailability={seasonAvailability}
      />
    </>
  );
}
