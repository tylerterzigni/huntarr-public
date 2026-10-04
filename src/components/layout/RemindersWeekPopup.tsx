"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Check, Eye, Loader2, X } from "lucide-react";
import { PosterImage } from "@/components/media/PosterImage";
import { useClampedDropdownStyle } from "@/components/search/use-clamped-dropdown-style";
import { cn, posterUrl } from "@/lib/utils";
import {
  dispatchRemindersChanged,
  type UpcomingRelease,
  type UpcomingReminder,
} from "@/lib/reminders/client";

/** A reminder with the release that lands in the current week. */
export type WeekReminder = UpcomingReminder & { release: UpcomingRelease };

function parseLocalDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Keep reminders with a release in the viewer's current Sunday–Saturday week. */
export function pickThisWeek(items: UpcomingReminder[], now = new Date()): WeekReminder[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  const picked: WeekReminder[] = [];
  for (const item of items) {
    const release = item.releases
      .filter((r) => {
        const date = parseLocalDate(r.date);
        return date >= start && date < end;
      })
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (release) picked.push({ ...item, release });
  }
  return picked.sort((a, b) => a.release.date.localeCompare(b.release.date));
}

function formatDay(date: string) {
  return parseLocalDate(date).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function WeekCard({
  item,
  busy,
  disabled,
  onReady,
  onView,
}: {
  item: WeekReminder;
  busy: boolean;
  disabled: boolean;
  onReady: () => void;
  onView: () => void;
}) {
  const overlayBtn =
    "inline-flex w-[5.5rem] items-center justify-center gap-1.5 rounded-md border border-white/60 bg-white/85 px-2 py-1.5 text-xs font-semibold text-gray-900 shadow transition-colors hover:bg-white disabled:opacity-60";

  return (
    <div className="min-w-0">
      {/* tabIndex lets touch devices tap the poster to reveal the buttons. */}
      <div
        tabIndex={0}
        className="group media-poster-frame relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-seerr-card shadow-lg outline-none"
      >
        <PosterImage
          src={posterUrl(item.posterPath, "w342")}
          alt={item.title}
          className="transition-opacity duration-150 group-hover:opacity-40 group-focus-within:opacity-40"
        />
        <div
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 transition-opacity duration-150",
            busy
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          )}
        >
          <Link
            href={`/${item.mediaType}/${item.tmdbId}`}
            onClick={onView}
            className={overlayBtn}
          >
            <Eye className="h-3.5 w-3.5" />
            View
          </Link>
          <button
            type="button"
            className={overlayBtn}
            disabled={disabled}
            onClick={onReady}
            title={`Turn on monitoring and search in ${item.mediaType === "movie" ? "Radarr" : "Sonarr"}`}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Ready
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm font-medium line-clamp-2 text-foreground/90">{item.title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {formatDay(item.release.date)} · {item.release.label}
      </p>
    </div>
  );
}

interface RemindersWeekPopupProps {
  items: WeekReminder[];
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onItemsChange: (items: WeekReminder[]) => void;
}

export function RemindersWeekPopup({
  items,
  anchorRef,
  onClose,
  onItemsChange,
}: RemindersWeekPopupProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const dropdownStyle = useClampedDropdownStyle(anchorRef, true, 420, { align: "center" });

  // Close on outside click / Escape. Delay attaching so the opening frame can't dismiss it.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onPointerDown(e: PointerEvent) {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
    }, 200);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [anchorRef, onClose]);

  async function markReady(item: WeekReminder) {
    if (busyId) return;
    setBusyId(item.id);
    setMessage("");
    try {
      const res = await fetch(`/api/reminders/${item.id}/ready`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to start search");
      onItemsChange(items.filter((i) => i.id !== item.id));
      dispatchRemindersChanged();
      setMessage(
        `${item.title} is now searching in ${item.mediaType === "movie" ? "Radarr" : "Sonarr"}.`
      );
    } catch (err) {
      setMessage(`${item.title}: ${err instanceof Error ? err.message : "Failed to start search"}`);
    } finally {
      setBusyId(null);
    }
  }

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Reminders coming out this week"
      className={cn(
        "z-50 rounded-lg border border-gray-300 bg-white shadow-xl",
        dropdownStyle ? undefined : "absolute right-0 top-full mt-2 w-[420px]"
      )}
      style={dropdownStyle}
    >
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5">
        <p className="text-sm font-semibold text-gray-900">Coming out this week</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-gray-600 hover:bg-gray-900/5 hover:text-gray-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div
        className="max-h-[min(26rem,calc(100dvh-var(--safe-area-top)-8rem))] overflow-x-hidden overflow-y-auto p-4"
        style={dropdownStyle?.maxHeight ? { maxHeight: dropdownStyle.maxHeight } : undefined}
      >
        {message && <p className="mb-3 text-xs text-gray-700">{message}</p>}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing else coming out this week.</p>
        ) : (
          <div className="grid grid-cols-3 gap-x-4 gap-y-5">
            {items.map((item) => (
              <WeekCard
                key={item.id}
                item={item}
                busy={busyId === item.id}
                disabled={busyId !== null}
                onReady={() => void markReady(item)}
                onView={onClose}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (dropdownStyle && typeof document !== "undefined") {
    return createPortal(panel, document.body);
  }
  return panel;
}
