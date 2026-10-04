"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertCircle, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { backdropUrl, cn, episodeAvailabilityKey } from "@/lib/utils";
import { glassSelect } from "@/lib/styles/glass";
import type { SeasonAvailabilityStatus } from "@/lib/integrations/arr/availability";
import type { MediaType } from "@/types";
import type { TmdbSeasonSummary } from "@/components/media/SeasonsSection";

interface ArrAddModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  backdropPath?: string | null;
  seasons?: TmdbSeasonSummary[];
  episodeAvailability?: string[];
  seasonAvailability?: Record<number, SeasonAvailabilityStatus>;
}

interface Instance {
  id: string;
  name: string;
  type: string;
}

interface TmdbEpisode {
  episode_number: number;
  name: string;
  air_date?: string;
}

const SEARCH_MISSING_STORAGE_KEY = "huntarr-arr-search-for-missing";

function readSearchForMissingPreference(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(SEARCH_MISSING_STORAGE_KEY);
    if (stored === "false") return false;
    if (stored === "true") return true;
  } catch {
    // localStorage may be unavailable
  }
  return true;
}

function writeSearchForMissingPreference(value: boolean) {
  try {
    window.localStorage.setItem(SEARCH_MISSING_STORAGE_KEY, String(value));
  } catch {
    // localStorage may be unavailable
  }
}

type SeasonStatus = "available" | "partial" | "not_requested";

type EpisodeSelection = Map<number, Set<number>>;

function getSeasonStatus(
  seasonNumber: number,
  episodeCount: number,
  availability: Set<string>,
  seasonAvailability?: Record<number, SeasonAvailabilityStatus>
): SeasonStatus {
  let availableCount = 0;
  if (episodeCount > 0) {
    for (let episode = 1; episode <= episodeCount; episode++) {
      if (availability.has(episodeAvailabilityKey(seasonNumber, episode))) {
        availableCount++;
      }
    }
  }

  const fromEpisodes: SeasonStatus =
    episodeCount <= 0 || availableCount === 0
      ? "not_requested"
      : availableCount >= episodeCount
        ? "available"
        : "partial";

  const fromSonarr = seasonAvailability?.[seasonNumber];

  // Prefer partial whenever either source says the season is incomplete.
  if (fromSonarr === "partial" || fromEpisodes === "partial") return "partial";
  if (fromSonarr === "available" || fromEpisodes === "available") return "available";
  return "not_requested";
}

function episodeNumbersForSeason(episodeCount: number, loaded?: TmdbEpisode[]) {
  if (loaded && loaded.length > 0) {
    return loaded.map((episode) => episode.episode_number);
  }
  return Array.from({ length: Math.max(0, episodeCount) }, (_, i) => i + 1);
}

function buildInitialSelection(
  seasons: TmdbSeasonSummary[],
  availability: Set<string>,
  seasonAvailability?: Record<number, SeasonAvailabilityStatus>
): EpisodeSelection {
  const initial: EpisodeSelection = new Map();
  for (const season of seasons) {
    if (season.season_number <= 0 || season.episode_count <= 0) continue;
    const status = getSeasonStatus(
      season.season_number,
      season.episode_count,
      availability,
      seasonAvailability
    );
    if (status === "available") continue;

    const episodes = new Set<number>();
    for (let episode = 1; episode <= season.episode_count; episode++) {
      if (!availability.has(episodeAvailabilityKey(season.season_number, episode))) {
        episodes.add(episode);
      }
    }
    if (episodes.size > 0) {
      initial.set(season.season_number, episodes);
    }
  }
  return initial;
}

function SeasonStatusBadge({ status }: { status: SeasonStatus }) {
  if (status === "available") {
    return (
      <span className="inline-flex rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-medium text-white">
        Available
      </span>
    );
  }
  if (status === "partial") {
    return (
      <span className="inline-flex rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-medium text-white">
        Partially Available
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-seerr-accent/90 px-2.5 py-0.5 text-xs font-medium text-white">
      Not Requested
    </span>
  );
}

function Toggle({
  checked,
  onCheckedChange,
  disabled,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seerr-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-seerr-accent" : "bg-gray-300"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
          checked && "translate-x-4"
        )}
      />
    </button>
  );
}

export function ArrAddModal({
  open,
  onOpenChange,
  tmdbId,
  mediaType,
  title,
  backdropPath,
  seasons = [],
  episodeAvailability = [],
  seasonAvailability = {},
}: ArrAddModalProps) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [profiles, setProfiles] = useState<Array<{ id: number; name: string }>>([]);
  const [folders, setFolders] = useState<Array<{ id: number; path: string }>>([]);
  const [instanceId, setInstanceId] = useState("");
  const [qualityProfileId, setQualityProfileId] = useState<number>();
  const [rootFolder, setRootFolder] = useState("");
  const [selectedEpisodes, setSelectedEpisodes] = useState<EpisodeSelection>(new Map());
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set());
  const [loadedEpisodes, setLoadedEpisodes] = useState<Record<number, TmdbEpisode[]>>({});
  const [loadingSeason, setLoadingSeason] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [searchForMissing, setSearchForMissing] = useState(true);

  const isTv = mediaType === "tv";
  const backdrop = backdropUrl(backdropPath);
  const availability = useMemo(() => new Set(episodeAvailability), [episodeAvailability]);

  const regularSeasons = useMemo(
    () =>
      seasons
        .filter((season) => season.season_number > 0)
        .sort((a, b) => a.season_number - b.season_number),
    [seasons]
  );

  const seasonRows = useMemo(
    () =>
      regularSeasons.map((season) => ({
        ...season,
        status: getSeasonStatus(
          season.season_number,
          season.episode_count,
          availability,
          seasonAvailability
        ),
      })),
    [regularSeasons, availability, seasonAvailability]
  );

  const selectedSeasonCount = useMemo(() => {
    let count = 0;
    for (const episodes of selectedEpisodes.values()) {
      if (episodes.size > 0) count += 1;
    }
    return count;
  }, [selectedEpisodes]);

  const selectedEpisodeCount = useMemo(() => {
    let count = 0;
    for (const episodes of selectedEpisodes.values()) {
      count += episodes.size;
    }
    return count;
  }, [selectedEpisodes]);

  const allSelected =
    seasonRows.length > 0 &&
    seasonRows.every((season) => {
      const selected = selectedEpisodes.get(season.season_number);
      if (!selected || selected.size === 0) return false;
      const allNumbers = episodeNumbersForSeason(
        season.episode_count,
        loadedEpisodes[season.season_number]
      );
      return allNumbers.every((n) => selected.has(n));
    });

  useEffect(() => {
    setSearchForMissing(readSearchForMissingPreference());
  }, []);

  useEffect(() => {
    if (!open) return;

    setSuccess(false);
    setError("");
    setLoading(false);
    setExpandedSeasons(new Set());
    setLoadedEpisodes({});
    setLoadingSeason(null);
    setSearchForMissing(readSearchForMissingPreference());
    setSelectedEpisodes(
      buildInitialSelection(seasons, new Set(episodeAvailability), seasonAvailability)
    );

    fetch(`/api/arr/instances?type=${mediaType === "movie" ? "radarr" : "sonarr"}`)
      .then((r) => r.json())
      .then((data) => {
        setInstances(data.instances ?? []);
        if (data.instances?.[0]) setInstanceId(data.instances[0].id);
      });
  }, [open, mediaType, seasons, episodeAvailability, seasonAvailability]);

  useEffect(() => {
    if (!instanceId) return;
    fetch(`/api/arr/profiles?instanceId=${instanceId}`)
      .then((r) => r.json())
      .then((data) => {
        setProfiles(data.profiles ?? []);
        setFolders(data.folders ?? []);
        if (data.profiles?.[0]) setQualityProfileId(data.profiles[0].id);
        if (data.folders?.[0]) setRootFolder(data.folders[0].path);
      });
  }, [instanceId]);

  function setSeasonEpisodes(seasonNumber: number, episodeNumbers: number[]) {
    setSelectedEpisodes((prev) => {
      const updated = new Map(prev);
      if (episodeNumbers.length === 0) {
        updated.delete(seasonNumber);
      } else {
        updated.set(seasonNumber, new Set(episodeNumbers));
      }
      return updated;
    });
  }

  function toggleSeason(seasonNumber: number, episodeCount: number, next: boolean) {
    const numbers = episodeNumbersForSeason(episodeCount, loadedEpisodes[seasonNumber]);
    setSeasonEpisodes(seasonNumber, next ? numbers : []);
  }

  function toggleAll(next: boolean) {
    if (!next) {
      setSelectedEpisodes(new Map());
      return;
    }

    const updated: EpisodeSelection = new Map();
    for (const season of seasonRows) {
      const numbers = episodeNumbersForSeason(
        season.episode_count,
        loadedEpisodes[season.season_number]
      );
      if (numbers.length > 0) {
        updated.set(season.season_number, new Set(numbers));
      }
    }
    setSelectedEpisodes(updated);
  }

  function toggleEpisode(seasonNumber: number, episodeNumber: number, next: boolean) {
    setSelectedEpisodes((prev) => {
      const updated = new Map(prev);
      const current = new Set(updated.get(seasonNumber) ?? []);
      if (next) current.add(episodeNumber);
      else current.delete(episodeNumber);
      if (current.size === 0) updated.delete(seasonNumber);
      else updated.set(seasonNumber, current);
      return updated;
    });
  }

  async function toggleSeasonExpanded(seasonNumber: number) {
    const willExpand = !expandedSeasons.has(seasonNumber);
    setExpandedSeasons((prev) => {
      const updated = new Set(prev);
      if (updated.has(seasonNumber)) updated.delete(seasonNumber);
      else updated.add(seasonNumber);
      return updated;
    });

    if (!willExpand) return;
    if (loadedEpisodes[seasonNumber] || loadingSeason === seasonNumber) return;

    setLoadingSeason(seasonNumber);
    try {
      const res = await fetch(`/api/tmdb/tv/${tmdbId}/season/${seasonNumber}`);
      if (!res.ok) return;
      const data = await res.json();
      const episodes = ((data.episodes as TmdbEpisode[]) ?? []).map((episode) => ({
        episode_number: episode.episode_number,
        name: episode.name,
        air_date: episode.air_date,
      }));
      setLoadedEpisodes((prev) => ({ ...prev, [seasonNumber]: episodes }));

      // If the whole season was selected via 1..count, remap onto real episode numbers
      setSelectedEpisodes((prev) => {
        const current = prev.get(seasonNumber);
        if (!current || current.size === 0 || episodes.length === 0) return prev;
        const seasonMeta = seasonRows.find((s) => s.season_number === seasonNumber);
        const count = seasonMeta?.episode_count ?? 0;
        const wasFullySelected =
          count > 0 &&
          Array.from({ length: count }, (_, i) => i + 1).every((n) => current.has(n));
        if (!wasFullySelected) return prev;
        const updated = new Map(prev);
        updated.set(seasonNumber, new Set(episodes.map((e) => e.episode_number)));
        return updated;
      });
    } finally {
      setLoadingSeason((current) => (current === seasonNumber ? null : current));
    }
  }

  async function handleAdd() {
    if (isTv && selectedEpisodeCount === 0) {
      setError("Select at least one episode to request.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const seasonsPayload = Array.from(selectedEpisodes.entries())
        .filter(([, episodes]) => episodes.size > 0)
        .map(([seasonNumber]) => seasonNumber)
        .sort((a, b) => a - b);

      const episodesPayload = Array.from(selectedEpisodes.entries())
        .filter(([, episodes]) => episodes.size > 0)
        .map(([seasonNumber, episodes]) => ({
          seasonNumber,
          episodeNumbers: Array.from(episodes).sort((a, b) => a - b),
        }))
        .sort((a, b) => a.seasonNumber - b.seasonNumber);

      const res = await fetch("/api/arr/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId,
          tmdbId,
          mediaType,
          title,
          qualityProfileId,
          rootFolder,
          searchForMissing,
          ...(isTv
            ? {
                seasons: seasonsPayload,
                episodes: episodesPayload,
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setLoading(false);
    }
  }

  const submitLabel = isTv ? "Select Season(s)" : "Request";
  const canSubmit =
    Boolean(instanceId) &&
    !loading &&
    (!isTv || selectedEpisodeCount > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(event) => event.preventDefault()}
        className={cn(
          "max-h-[90vh] w-full max-w-2xl overflow-hidden border-gray-600 bg-seerr-bg p-0 shadow-xl sm:rounded-lg",
          "gap-0"
        )}
      >
        <div className="relative overflow-y-auto max-h-[90vh]">
          {/* Backdrop header */}
          <div className="relative min-h-[140px] overflow-hidden bg-gray-800">
            {backdrop && (
              <Image
                src={backdrop}
                alt=""
                fill
                className="object-cover object-center opacity-50"
                sizes="672px"
                priority={false}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-seerr-bg via-seerr-bg/70 to-black/40" />
            <div className="pointer-events-none relative z-10 px-6 pb-4 pt-8 pr-12">
              <DialogTitle className="text-2xl font-bold text-gray-800">
                {isTv ? "Request Series" : "Request Movie"}
              </DialogTitle>
              <p className="mt-1 text-xl font-semibold text-gray-900">{title}</p>
            </div>
          </div>

          <div className="space-y-5 px-6 pb-6 pt-2">
            {success ? (
              <p className="text-emerald-700">
                Successfully added to your library manager!
              </p>
            ) : (
              <>
                {isTv && seasonRows.length > 0 && (
                  <div className="overflow-hidden rounded-lg border border-gray-300/70 bg-white/60 backdrop-blur-md">
                    <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 border-b border-gray-300/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <Toggle
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                        aria-label="Select all seasons"
                      />
                      <span>Season</span>
                      <span className="text-right"># of Episodes</span>
                      <span className="min-w-[7.5rem] text-right">Status</span>
                    </div>
                    <ul className="divide-y divide-gray-300/60">
                      {seasonRows.map((season) => {
                        const selected = selectedEpisodes.get(season.season_number);
                        const allNumbers = episodeNumbersForSeason(
                          season.episode_count,
                          loadedEpisodes[season.season_number]
                        );
                        const checked = Boolean(selected) && selected!.size > 0;
                        const isExpanded = expandedSeasons.has(season.season_number);
                        const episodes = loadedEpisodes[season.season_number] ?? [];
                        const isLoadingEpisodes = loadingSeason === season.season_number;

                        return (
                          <li key={season.season_number}>
                            <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3">
                              <Toggle
                                checked={checked}
                                onCheckedChange={(next) =>
                                  toggleSeason(
                                    season.season_number,
                                    season.episode_count,
                                    next
                                  )
                                }
                                aria-label={`Season ${season.season_number}`}
                              />
                              <div className="flex min-w-0 items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleSeasonExpanded(season.season_number)
                                  }
                                  aria-expanded={isExpanded}
                                  aria-label={
                                    isExpanded
                                      ? `Hide season ${season.season_number} episodes`
                                      : `Show season ${season.season_number} episodes`
                                  }
                                  className="rounded p-0.5 text-gray-500 transition-colors hover:bg-gray-200/70 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seerr-accent"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </button>
                                <span className="text-sm font-medium text-gray-900">
                                  Season {season.season_number}
                                </span>
                              </div>
                              <span className="text-right text-sm text-gray-600 tabular-nums">
                                {season.episode_count}
                              </span>
                              <span className="flex min-w-[7.5rem] justify-end">
                                <SeasonStatusBadge status={season.status} />
                              </span>
                            </div>

                            {isExpanded && (
                              <ul className="border-t border-gray-300/50 bg-white/40">
                                {isLoadingEpisodes && episodes.length === 0 && (
                                  <li className="flex items-center gap-2 px-4 py-3 pl-14 text-sm text-gray-500">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading episodes…
                                  </li>
                                )}
                                {!isLoadingEpisodes &&
                                  episodes.length === 0 &&
                                  allNumbers.map((episodeNumber) => {
                                    const episodeChecked =
                                      selected?.has(episodeNumber) ?? false;
                                    const isAvailable = availability.has(
                                      episodeAvailabilityKey(
                                        season.season_number,
                                        episodeNumber
                                      )
                                    );
                                    return (
                                      <li
                                        key={episodeNumber}
                                        className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-gray-300/40 px-4 py-2.5 pl-14 first:border-t-0"
                                      >
                                        <Toggle
                                          checked={episodeChecked}
                                          onCheckedChange={(next) =>
                                            toggleEpisode(
                                              season.season_number,
                                              episodeNumber,
                                              next
                                            )
                                          }
                                          aria-label={`Season ${season.season_number} episode ${episodeNumber}`}
                                        />
                                        <span className="text-sm text-gray-800">
                                          Episode {episodeNumber}
                                        </span>
                                        {isAvailable ? (
                                          <span className="text-xs font-medium text-emerald-700">
                                            Available
                                          </span>
                                        ) : (
                                          <span />
                                        )}
                                      </li>
                                    );
                                  })}
                                {episodes.map((episode) => {
                                  const episodeChecked =
                                    selected?.has(episode.episode_number) ?? false;
                                  const isAvailable = availability.has(
                                    episodeAvailabilityKey(
                                      season.season_number,
                                      episode.episode_number
                                    )
                                  );
                                  return (
                                    <li
                                      key={episode.episode_number}
                                      className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-gray-300/40 px-4 py-2.5 pl-14 first:border-t-0"
                                    >
                                      <Toggle
                                        checked={episodeChecked}
                                        onCheckedChange={(next) =>
                                          toggleEpisode(
                                            season.season_number,
                                            episode.episode_number,
                                            next
                                          )
                                        }
                                        aria-label={`Season ${season.season_number} episode ${episode.episode_number}`}
                                      />
                                      <span className="min-w-0 truncate text-sm text-gray-800">
                                        <span className="font-medium tabular-nums">
                                          {episode.episode_number}
                                        </span>
                                        {episode.name ? ` – ${episode.name}` : ""}
                                      </span>
                                      {isAvailable ? (
                                        <span className="shrink-0 text-xs font-medium text-emerald-700">
                                          Available
                                        </span>
                                      ) : (
                                        <span />
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-900">Advanced</h3>
                  {instances.length > 1 && (
                    <div>
                      <Label className="text-xs text-gray-500">Instance</Label>
                      <select
                        className={cn(glassSelect, "mt-1")}
                        value={instanceId}
                        onChange={(e) => setInstanceId(e.target.value)}
                      >
                        {instances.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs text-gray-500">Quality Profile</Label>
                    <select
                      className={cn(glassSelect, "mt-1")}
                      value={qualityProfileId ?? ""}
                      onChange={(e) => setQualityProfileId(Number(e.target.value))}
                    >
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {folders.length > 1 && (
                    <div>
                      <Label className="text-xs text-gray-500">Root Folder</Label>
                      <select
                        className={cn(glassSelect, "mt-1")}
                        value={rootFolder}
                        onChange={(e) => setRootFolder(e.target.value)}
                      >
                        {folders.map((f) => (
                          <option key={f.id} value={f.path}>
                            {f.path}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-md border border-red-500/60 bg-red-600/15 px-3 py-2 text-sm font-medium text-red-500"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-400 accent-seerr-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seerr-accent focus-visible:ring-offset-2"
                    checked={searchForMissing}
                    onChange={(event) => {
                      const next = event.target.checked;
                      setSearchForMissing(next);
                      writeSearchForMissingPreference(next);
                    }}
                  />
                  <span>
                    {isTv
                      ? "Start search for missing TV series"
                      : "Start search for missing movie"}
                  </span>
                </label>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleAdd}
                    disabled={!canSubmit}
                  >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {submitLabel}
                    {isTv && selectedSeasonCount > 0 && !allSelected
                      ? ` (${selectedSeasonCount})`
                      : ""}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
