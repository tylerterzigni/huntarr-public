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
import { Loader2 } from "lucide-react";
import { backdropUrl, cn, episodeAvailabilityKey } from "@/lib/utils";
import { glassSelect } from "@/lib/styles/glass";
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
}

interface Instance {
  id: string;
  name: string;
  type: string;
}

type SeasonStatus = "available" | "partial" | "not_requested";

function getSeasonStatus(
  seasonNumber: number,
  episodeCount: number,
  availability: Set<string>
): SeasonStatus {
  if (episodeCount <= 0) return "not_requested";

  let availableCount = 0;
  for (let episode = 1; episode <= episodeCount; episode++) {
    if (availability.has(episodeAvailabilityKey(seasonNumber, episode))) {
      availableCount++;
    }
  }

  if (availableCount === 0) return "not_requested";
  if (availableCount >= episodeCount) return "available";
  return "partial";
}

function SeasonStatusBadge({ status }: { status: SeasonStatus }) {
  if (status === "available") {
    return (
      <span className="inline-flex rounded-full bg-emerald-600/90 px-2.5 py-0.5 text-xs font-medium text-white">
        Available
      </span>
    );
  }
  if (status === "partial") {
    return (
      <span className="inline-flex rounded-full bg-lime-600/90 px-2.5 py-0.5 text-xs font-medium text-white">
        Partial
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
}: ArrAddModalProps) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [profiles, setProfiles] = useState<Array<{ id: number; name: string }>>([]);
  const [folders, setFolders] = useState<Array<{ id: number; path: string }>>([]);
  const [instanceId, setInstanceId] = useState("");
  const [qualityProfileId, setQualityProfileId] = useState<number>();
  const [rootFolder, setRootFolder] = useState("");
  const [selectedSeasons, setSelectedSeasons] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

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
        status: getSeasonStatus(season.season_number, season.episode_count, availability),
      })),
    [regularSeasons, availability]
  );

  const allSelected =
    seasonRows.length > 0 && seasonRows.every((s) => selectedSeasons.has(s.season_number));
  const someSelected = seasonRows.some((s) => selectedSeasons.has(s.season_number));

  useEffect(() => {
    if (!open) return;

    setSuccess(false);
    setError("");
    setLoading(false);

    const initial = new Set<number>();
    for (const season of seasons) {
      if (season.season_number <= 0) continue;
      const status = getSeasonStatus(
        season.season_number,
        season.episode_count,
        new Set(episodeAvailability)
      );
      if (status !== "available") {
        initial.add(season.season_number);
      }
    }
    setSelectedSeasons(initial);

    fetch(`/api/arr/instances?type=${mediaType === "movie" ? "radarr" : "sonarr"}`)
      .then((r) => r.json())
      .then((data) => {
        setInstances(data.instances ?? []);
        if (data.instances?.[0]) setInstanceId(data.instances[0].id);
      });
  }, [open, mediaType, seasons, episodeAvailability]);

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

  function toggleSeason(seasonNumber: number, next: boolean) {
    setSelectedSeasons((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(seasonNumber);
      else updated.delete(seasonNumber);
      return updated;
    });
  }

  function toggleAll(next: boolean) {
    if (next) {
      setSelectedSeasons(new Set(seasonRows.map((s) => s.season_number)));
    } else {
      setSelectedSeasons(new Set());
    }
  }

  async function handleAdd() {
    if (isTv && selectedSeasons.size === 0) {
      setError("Select at least one season to request.");
      return;
    }

    setLoading(true);
    setError("");
    try {
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
          ...(isTv ? { seasons: Array.from(selectedSeasons).sort((a, b) => a - b) } : {}),
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
    (!isTv || selectedSeasons.size > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
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
            <div className="relative z-10 px-6 pb-4 pt-8 pr-12">
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
                        const checked = selectedSeasons.has(season.season_number);
                        return (
                          <li
                            key={season.season_number}
                            className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3"
                          >
                            <Toggle
                              checked={checked}
                              onCheckedChange={(next) =>
                                toggleSeason(season.season_number, next)
                              }
                              aria-label={`Season ${season.season_number}`}
                            />
                            <span className="text-sm font-medium text-gray-900">
                              Season {season.season_number}
                            </span>
                            <span className="text-right text-sm text-gray-600 tabular-nums">
                              {season.episode_count}
                            </span>
                            <span className="flex min-w-[7.5rem] justify-end">
                              <SeasonStatusBadge status={season.status} />
                            </span>
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

                {error && <p className="text-sm text-red-600">{error}</p>}

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
                    {isTv && someSelected && !allSelected
                      ? ` (${selectedSeasons.size})`
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
