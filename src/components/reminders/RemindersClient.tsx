"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Loader2, Play, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ListItemSearch } from "@/components/settings/ListItemSearch";
import {
  LIST_PAGE_SIZE,
  ListPagination,
  paginate,
  sortByTitle,
  totalPages,
} from "@/components/settings/list-pagination";
import { cn, posterUrl } from "@/lib/utils";
import { REMINDERS_CHANGED_EVENT, dispatchRemindersChanged } from "@/lib/reminders/client";
import type { MediaType } from "@/types";

interface ReminderItem {
  id: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  trailerUrl: string | null;
}

function trailerHref(item: ReminderItem): string {
  if (item.trailerUrl) return item.trailerUrl;
  const query = [item.title, item.year, "official trailer"].filter(Boolean).join(" ");
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function serviceName(mediaType: MediaType) {
  return mediaType === "movie" ? "Radarr" : "Sonarr";
}

export function RemindersClient() {
  const [items, setItems] = useState<ReminderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [readyId, setReadyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReminderItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/reminders");
      if (res.ok) {
        const data = (await res.json()) as { items: ReminderItem[] };
        setItems(data.items);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const reload = () => void load();
    window.addEventListener(REMINDERS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(REMINDERS_CHANGED_EVENT, reload);
  }, [load]);

  const sortedItems = useMemo(() => sortByTitle(items), [items]);
  const pages = totalPages(sortedItems.length, LIST_PAGE_SIZE);
  const safePage = Math.min(page, pages);
  const pagedItems = paginate(sortedItems, safePage, LIST_PAGE_SIZE);
  const searchItems = useMemo(
    () =>
      sortedItems.map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.mediaType,
      })),
    [sortedItems]
  );

  useEffect(() => {
    if (!highlightedId) return;
    const timer = window.setTimeout(() => setHighlightedId(null), 2500);
    return () => window.clearTimeout(timer);
  }, [highlightedId]);

  useEffect(() => {
    if (!highlightedId) return;
    if (!pagedItems.some((item) => item.id === highlightedId)) return;
    document.getElementById(`reminder-item-${highlightedId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [highlightedId, pagedItems]);

  function jumpToItem(id: string) {
    const index = sortedItems.findIndex((item) => item.id === id);
    if (index < 0) return;
    setPage(Math.floor(index / LIST_PAGE_SIZE) + 1);
    setHighlightedId(id);
  }

  async function markReady(item: ReminderItem) {
    if (readyId) return;
    setReadyId(item.id);
    setMessage("");
    try {
      const res = await fetch(`/api/reminders/${item.id}/ready`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to start search");
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      dispatchRemindersChanged();
      setMessage(`${item.title} is now monitored and searching in ${serviceName(item.mediaType)}.`);
    } catch (err) {
      setMessage(`${item.title}: ${err instanceof Error ? err.message : "Failed to start search"}`);
    } finally {
      setReadyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/reminders?id=${deleteTarget.id}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; arrError?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to remove");
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      dispatchRemindersChanged();
      if (body.arrError) {
        setMessage(
          `Removed ${deleteTarget.title} from Reminders, but ${serviceName(deleteTarget.mediaType)} cleanup failed: ${body.arrError}`
        );
      }
      setDeleteTarget(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="px-4 md:px-8 py-8 max-w-4xl">
      {message && (
        <p className="mb-4 text-sm text-gray-700 bg-gray-500/10 rounded p-2">{message}</p>
      )}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Reminders</CardTitle>
            <ListItemSearch
              items={searchItems}
              onSelect={(item) => jumpToItem(item.id)}
              placeholder="Search reminders..."
              emptyLabel="No reminders yet."
              noMatchLabel="No matching reminders."
              ariaLabel="Search reminders"
              title="Find an item on your reminders list"
              disabled={sortedItems.length === 0}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Movies and shows parked in Radarr/Sonarr without monitoring. Tap Ready to start
            monitoring and searching.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
            </div>
          ) : sortedItems.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No reminders yet. Tap Remind Me on a movie or TV show detail page.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {pagedItems.map((item) => {
                  const detailHref = `/${item.mediaType}/${item.tmdbId}`;
                  return (
                    <div
                      key={item.id}
                      id={`reminder-item-${item.id}`}
                      className={`flex items-center gap-3 rounded-lg border p-2 text-sm backdrop-blur-md transition-colors ${
                        highlightedId === item.id
                          ? "border-gray-500 bg-white/80 ring-2 ring-gray-400/60"
                          : "border-gray-300/70 bg-white/40"
                      }`}
                    >
                      <Link href={detailHref} className="shrink-0" aria-label={item.title}>
                        <Image
                          src={posterUrl(item.posterPath, "w185")}
                          alt=""
                          width={40}
                          height={60}
                          className="h-[60px] w-10 rounded object-cover shadow-sm"
                        />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link href={detailHref} className="block truncate font-medium hover:underline">
                          {item.title}
                        </Link>
                        <span className="text-muted-foreground">
                          {item.mediaType === "movie" ? "Movie" : "TV"}
                          {item.year ? ` · ${item.year}` : ""}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                        <a
                          href={trailerHref(item)}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "px-2 sm:px-3"
                          )}
                          aria-label={`Watch trailer for ${item.title}`}
                          title={item.trailerUrl ? "Watch the official trailer" : "Search YouTube for the trailer"}
                        >
                          <Play className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Trailer</span>
                        </a>
                        <Button
                          variant="glass"
                          size="sm"
                          className="px-2 sm:px-3"
                          disabled={readyId !== null}
                          aria-label={`Mark ${item.title} ready: monitor and search`}
                          title={`Turn on monitoring and search in ${serviceName(item.mediaType)}`}
                          onClick={() => void markReady(item)}
                        >
                          {readyId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin sm:mr-1" />
                          ) : (
                            <Check className="h-4 w-4 sm:mr-1" />
                          )}
                          <span className="hidden sm:inline">Ready</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove ${item.title} from reminders`}
                          onClick={() => setDeleteTarget(item)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <ListPagination
                page={safePage}
                totalPages={pages}
                onPrevious={() => setPage((p) => Math.max(1, Math.min(p, pages) - 1))}
                onNext={() => setPage((p) => Math.min(pages, Math.min(p, pages) + 1))}
              />
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleteTarget(null);
        }}
        title={`Remove ${deleteTarget?.title ?? "reminder"}?`}
        description={`This removes the reminder. If Huntarr added it to ${
          deleteTarget ? serviceName(deleteTarget.mediaType) : "Radarr/Sonarr"
        } and it is still unmonitored with no files, it is removed there too.`}
        confirmLabel="Remove"
        loading={deleteBusy}
        loadingLabel="Removing..."
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
