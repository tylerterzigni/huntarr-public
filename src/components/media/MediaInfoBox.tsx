"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ImdbLinkIcon,
  JustWatchLinkIcon,
  PlexLinkIcon,
  RottenTomatoesLinkIcon,
  TmdbLinkIcon,
  TraktLinkIcon,
  TvdbLinkIcon,
} from "@/components/media/ExternalLinkIcons";
import { RottenTomatoesIcon, TmdbIcon } from "@/components/media/RatingIcons";
import { cn, formatAirDate, providerLogoUrl } from "@/lib/utils";
import { ChevronDown, Download, EyeOff, Loader2, Play } from "lucide-react";
import { LikeButton } from "@/components/media/LikeButton";
import { RemindMeButton } from "@/components/media/RemindMeButton";
import type { MediaType } from "@/types";
import type { RTRatings } from "@/lib/integrations/rottentomatoes/client";

interface MediaInfoBoxProps {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  details: Record<string, unknown>;
  watchRegion: string;
  rtRatings?: RTRatings | null;
  inLibrary: boolean;
  inArr?: boolean;
  inPlex: boolean;
  plexPlayUrl?: string | null;
  isHidden: boolean;
  isLiked: boolean;
  isReminded: boolean;
  isAdmin: boolean;
  trailerUrl: string | null;
  onAddToArr: () => void;
  onHideUser: () => void | Promise<void>;
  onHideGlobal: () => void | Promise<void>;
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-300/40 px-4 py-2.5 text-sm last:border-b-0">
      <dt className="font-semibold text-gray-900">{label}</dt>
      <dd className="text-right text-gray-600">{children}</dd>
    </div>
  );
}

function countryFlag(iso: string): string {
  return iso
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function formatLanguage(code: string | undefined): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

const defaultBtn =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gray-300 bg-gray-100 px-3 text-sm font-medium text-gray-800 shadow-none transition-colors duration-150 ease-in-out hover:border-gray-400 hover:bg-gray-200";

const ghostBtn =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gray-300 bg-transparent px-3 text-sm font-medium text-gray-800 shadow-none transition-colors duration-150 ease-in-out hover:border-gray-400 focus:border-gray-500";

const glassBtn =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gray-300/70 bg-white/40 px-3 text-sm font-medium text-gray-800 shadow-none backdrop-blur-md transition-colors duration-150 ease-in-out hover:border-gray-400 hover:bg-white/55";

const requestBtn =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gray-500/70 bg-gray-500/35 px-3 text-sm font-medium text-gray-900 shadow-none backdrop-blur-md transition-colors duration-150 ease-in-out hover:border-gray-600 hover:bg-gray-500/50";

function HideForMeButton({
  title,
  onConfirm,
  className,
}: {
  title: string;
  onConfirm: () => void | Promise<void>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    if (loading) return;
    setLoading(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={cn(glassBtn, "min-w-0", className)}
        aria-label="Hide for Me"
        title="Hide for Me"
        disabled={loading}
        onClick={() => setOpen(true)}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <EyeOff className="h-4 w-4 shrink-0" />
        )}
        <span className="truncate font-semibold">Hide for Me</span>
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Hide ${title}?`}
        description="This will add the title to your personal blocklist. Hidden titles no longer appear in browse and recommendations. You can remove them from Settings → Hide List."
        confirmLabel="Hide for Me"
        loading={loading}
        loadingLabel="Hiding..."
        onConfirm={() => void handleConfirm()}
      />
    </>
  );
}

function HideGloballyButton({
  title,
  onConfirm,
}: {
  title: string;
  onConfirm: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    if (loading) return;
    setLoading(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={cn(defaultBtn, "mt-2 w-full")}
        disabled={loading}
        onClick={() => setOpen(true)}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <EyeOff className="h-4 w-4" />
        )}
        Hide Globally
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Hide ${title} globally?`}
        description="This hides the title for everyone on this Huntarr instance. You can remove it later from Settings → Hide List."
        confirmLabel="Hide Globally"
        loading={loading}
        loadingLabel="Hiding..."
        onConfirm={() => void handleConfirm()}
      />
    </>
  );
}

function PlayOnPlexButton({
  plexUrl,
  trailerUrl,
}: {
  plexUrl: string;
  trailerUrl: string | null;
}) {
  const mainClass = cn(ghostBtn, "min-w-0 flex-1", trailerUrl && "rounded-r-none");
  const dropdownClass = cn(ghostBtn, "-ml-px shrink-0 rounded-l-none px-2.5");

  return (
    <div className="flex w-full min-w-0">
      <a href={plexUrl} target="_blank" rel="noreferrer" className={mainClass}>
        <Play className="h-4 w-4 shrink-0" />
        Play on Plex
      </a>
      {trailerUrl && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" aria-label="More actions" className={dropdownClass}>
              <ChevronDown className="h-4 w-4" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              className="z-50 min-w-[10rem] overflow-hidden rounded-md border border-gray-300/70 bg-white/40 p-1 shadow-lg backdrop-blur-md"
            >
              <DropdownMenu.Item asChild>
                <a
                  href={trailerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm text-gray-700 outline-none hover:bg-seerr-hover hover:text-gray-900"
                >
                  <Play className="mr-2 h-4 w-4" />
                  Watch Trailer
                </a>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </div>
  );
}

function MediaActionBar({
  title,
  mediaType,
  tmdbId,
  inArr,
  inPlex,
  isHidden,
  isLiked,
  isReminded,
  year,
  posterPath,
  trailerUrl,
  plexUrl,
  onAddToArr,
  onHideUser,
}: {
  title: string;
  mediaType: MediaType;
  tmdbId: number;
  inArr: boolean;
  inPlex: boolean;
  isHidden: boolean;
  isLiked: boolean;
  isReminded: boolean;
  year: number | null;
  posterPath: string | null;
  trailerUrl: string | null;
  plexUrl: string;
  onAddToArr: () => void;
  onHideUser: () => void | Promise<void>;
}) {
  const requestMore = mediaType === "tv" && inArr;
  const showRequest = !inPlex || requestMore;

  return (
    <div className="flex flex-col gap-2">
      {inPlex && <PlayOnPlexButton plexUrl={plexUrl} trailerUrl={trailerUrl} />}
      {showRequest && (
        <button type="button" className={cn(requestBtn, "w-full")} onClick={onAddToArr}>
          <Download className="h-5 w-5 shrink-0 text-gray-900" />
          <span className="font-bold text-gray-900 underline">
            {requestMore ? "Request More" : "Request"}
          </span>
        </button>
      )}
      {!inPlex && trailerUrl && (
        <a
          href={trailerUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(glassBtn, "w-full")}
        >
          <Play className="h-4 w-4 shrink-0" />
          Watch Trailer
        </a>
      )}
      {!inPlex && (
        <RemindMeButton
          tmdbId={tmdbId}
          mediaType={mediaType}
          title={title}
          year={year}
          posterPath={posterPath}
          trailerUrl={trailerUrl}
          initialReminded={isReminded}
        />
      )}
      <div className="flex gap-2">
        {!isHidden && (
          <HideForMeButton
            title={title}
            onConfirm={onHideUser}
            className="flex-1"
          />
        )}
        <LikeButton
          tmdbId={tmdbId}
          kind={mediaType}
          title={title}
          initialLiked={isLiked}
          className={isHidden ? "w-full" : "flex-1"}
        />
      </div>
    </div>
  );
}

export function MediaInfoBox({
  mediaType,
  tmdbId,
  title,
  details,
  watchRegion,
  rtRatings,
  inArr = false,
  inPlex,
  plexPlayUrl,
  isHidden,
  isLiked,
  isReminded,
  isAdmin,
  trailerUrl,
  onAddToArr,
  onHideUser,
  onHideGlobal,
}: MediaInfoBoxProps) {
  const voteAverage = details.vote_average as number;
  const voteCount = details.vote_count as number | undefined;
  const tmdbScore = voteAverage > 0 ? Math.round(voteAverage * 10) : null;
  const status = details.status as string | undefined;
  const airDate = (details.first_air_date ?? details.release_date) as string | undefined;
  const releaseYear = Number(airDate?.slice(0, 4));
  const originalLanguage = formatLanguage(details.original_language as string | undefined);
  const productionCountries =
    (details.production_countries as Array<{ iso_3166_1: string; name: string }>) ?? [];
  const networks = (details.networks as Array<{ name: string }>) ?? [];
  const externalIds = details.external_ids as { imdb_id?: string; tvdb_id?: number } | undefined;
  const imdbId = externalIds?.imdb_id ?? (details.imdb_id as string | undefined);
  const tvdbId = externalIds?.tvdb_id;
  const watchProviders = details["watch/providers"] as {
    results?: Record<
      string,
      { flatrate?: Array<{ provider_name: string; logo_path?: string }> }
    >;
  } | undefined;
  const streamingProviders = watchProviders?.results?.[watchRegion]?.flatrate ?? [];

  const tmdbUrl = `https://www.themoviedb.org/${mediaType}/${tmdbId}`;
  const traktType = mediaType === "movie" ? "movie" : "show";
  const traktUrl = `https://trakt.tv/search/tmdb/${tmdbId}?type=${traktType}`;
  const justWatchUrl = `https://www.justwatch.com/us/search?q=${encodeURIComponent(title)}`;
  const plexUrl =
    plexPlayUrl ??
    `https://app.plex.tv/desktop/#!/search?query=${encodeURIComponent(title)}`;
  const imdbUrl = imdbId ? `https://www.imdb.com/title/${imdbId}/` : null;
  const tvdbUrl =
    tvdbId != null
      ? mediaType === "tv"
        ? `https://www.thetvdb.com/?tab=series&id=${tvdbId}`
        : `https://www.thetvdb.com/?tab=movies&id=${tvdbId}`
      : null;

  const hasRatings =
    (tmdbScore != null && voteCount != null && voteCount > 0) ||
    rtRatings?.criticsScore != null ||
    rtRatings?.audienceScore != null;

  return (
    <aside className="w-full flex-shrink-0 space-y-2 lg:w-72 lg:sticky lg:top-20">
      <div>
        <MediaActionBar
          title={title}
          mediaType={mediaType}
          tmdbId={tmdbId}
          inArr={inArr}
          inPlex={inPlex}
          isHidden={isHidden}
          isLiked={isLiked}
          isReminded={isReminded}
          year={Number.isFinite(releaseYear) && releaseYear > 0 ? releaseYear : null}
          posterPath={(details.poster_path as string | null | undefined) ?? null}
          trailerUrl={trailerUrl}
          plexUrl={plexUrl}
          onAddToArr={onAddToArr}
          onHideUser={onHideUser}
        />
        {!isHidden && isAdmin && (
          <HideGloballyButton title={title} onConfirm={onHideGlobal} />
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-300/70 bg-white/40 shadow-none backdrop-blur-md">
        {hasRatings && (
          <div className="flex flex-wrap items-center justify-center gap-4 border-b border-gray-300/40 px-4 py-3">
            {tmdbScore != null && voteCount != null && voteCount > 0 && (
              <a
                href={tmdbUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900"
              >
                <TmdbIcon className="h-5 px-1.5 text-[10px]" />
                <span>{tmdbScore}%</span>
              </a>
            )}
            {rtRatings?.criticsScore != null && (
              <a
                href={rtRatings.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900"
              >
                <RottenTomatoesIcon rating={rtRatings.criticsRating} className="h-5 w-5" />
                <span>{rtRatings.criticsScore}%</span>
              </a>
            )}
            {rtRatings?.audienceScore != null && (
              <a
                href={rtRatings.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900"
                title="Audience score"
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#0ac855] text-[9px] font-bold text-white">
                  A
                </span>
                <span>{rtRatings.audienceScore}%</span>
              </a>
            )}
          </div>
        )}

        <dl>
          {status && <InfoRow label="Status">{status}</InfoRow>}
          {airDate && (
            <InfoRow label={mediaType === "tv" ? "First Air Date" : "Release Date"}>
              {formatAirDate(airDate)}
            </InfoRow>
          )}
          {originalLanguage && <InfoRow label="Original Language">{originalLanguage}</InfoRow>}
          {productionCountries.length > 0 && (
            <InfoRow label={productionCountries.length > 1 ? "Production Countries" : "Production Country"}>
              <span className="inline-flex flex-wrap justify-end gap-x-2 gap-y-1">
                {productionCountries.map((country) => (
                  <span key={country.iso_3166_1} className="inline-flex items-center gap-1">
                    <span aria-hidden>{countryFlag(country.iso_3166_1)}</span>
                    <span>{country.name}</span>
                  </span>
                ))}
              </span>
            </InfoRow>
          )}
          {mediaType === "tv" && networks.length > 0 && (
            <InfoRow label={networks.length > 1 ? "Networks" : "Network"}>
              {networks.map((network) => network.name).join(", ")}
            </InfoRow>
          )}
        </dl>

        {streamingProviders.length > 0 && (
          <div className="border-t border-gray-300/40 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Currently Streaming On</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {streamingProviders.map((provider) => (
                <div
                  key={provider.provider_name}
                  className="overflow-hidden rounded-md border border-gray-300/70 bg-white/40 backdrop-blur-md"
                  title={provider.provider_name}
                >
                  {provider.logo_path ? (
                    <Image
                      src={providerLogoUrl(provider.logo_path)!}
                      alt={provider.provider_name}
                      width={45}
                      height={45}
                      className="h-11 w-11 object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 items-center justify-center px-1 text-[10px] text-gray-600">
                      {provider.provider_name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-gray-300/40 px-4 py-3">
          {inPlex && <PlexLinkIcon href={plexUrl} />}
          <TmdbLinkIcon href={tmdbUrl} />
          {imdbUrl && <ImdbLinkIcon href={imdbUrl} />}
          {rtRatings?.url && <RottenTomatoesLinkIcon href={rtRatings.url} />}
          <TraktLinkIcon href={traktUrl} />
          {tvdbUrl && <TvdbLinkIcon href={tvdbUrl} />}
          <JustWatchLinkIcon href={justWatchUrl} />
        </div>
      </div>
    </aside>
  );
}
