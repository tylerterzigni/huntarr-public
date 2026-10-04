"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell, Eye, EyeOff, Menu, MessageSquare } from "lucide-react";
import {
  RemindersWeekPopup,
  pickThisWeek,
  type WeekReminder,
} from "@/components/layout/RemindersWeekPopup";
import { useLibraryWatchedVisibility } from "@/components/providers/LibraryWatchedVisibilityProvider";
import { REMINDERS_CHANGED_EVENT, type UpcomingReminder } from "@/lib/reminders/client";
import { cn } from "@/lib/utils";

interface OptionsMenuProps {
  onChatOpen?: () => void;
  lightNav?: boolean;
  /** Continuous fg color for detail-page contrast fade. */
  textColor?: string;
}

/** Popup shows once per browser session, this long after Huntarr loads. */
const WEEK_POPUP_DELAY_MS = 3000;
const WEEK_POPUP_SESSION_KEY = "huntarr:reminders-week-popup-shown";

function popupAlreadyShown() {
  try {
    return window.sessionStorage.getItem(WEEK_POPUP_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markPopupShown() {
  try {
    window.sessionStorage.setItem(WEEK_POPUP_SESSION_KEY, "1");
  } catch {
    // Storage blocked (private mode); the popup may show again next load.
  }
}

const itemClass =
  "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm text-gray-700 outline-none hover:bg-seerr-hover hover:text-gray-900 data-[highlighted]:bg-seerr-hover data-[highlighted]:text-gray-900";

export function OptionsMenu({ onChatOpen, lightNav = false, textColor }: OptionsMenuProps) {
  const router = useRouter();
  const anchorRef = useRef<HTMLDivElement>(null);
  const { hideLibraryAndWatched, toggleHideLibraryAndWatched } = useLibraryWatchedVisibility();
  const [count, setCount] = useState<number | null>(null);
  const [weekItems, setWeekItems] = useState<WeekReminder[] | null>(null);

  const loadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/reminders");
      if (!res.ok) return;
      const data = (await res.json()) as { items: unknown[] };
      setCount(data.items.length);
    } catch {
      // Keep the last known count.
    }
  }, []);

  useEffect(() => {
    void loadCount();
    const reload = () => void loadCount();
    window.addEventListener(REMINDERS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(REMINDERS_CHANGED_EVENT, reload);
  }, [loadCount]);

  useEffect(() => {
    if (popupAlreadyShown()) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      markPopupShown();
      try {
        const res = await fetch("/api/reminders/upcoming");
        if (!res.ok) return;
        const data = (await res.json()) as { items: UpcomingReminder[] };
        const thisWeek = pickThisWeek(data.items);
        if (!cancelled && thisWeek.length > 0) setWeekItems(thisWeek);
      } catch {
        // Silent: the popup is a convenience.
      }
    }, WEEK_POPUP_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const closePopup = useCallback(() => setWeekItems(null), []);

  return (
    <div ref={anchorRef} className="relative shrink-0">
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            style={textColor ? { color: textColor } : undefined}
            className={cn(
              "relative inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-300",
              lightNav
                ? "text-white hover:bg-white/10 data-[state=open]:bg-white/20"
                : "text-gray-700 hover:bg-gray-900/5 hover:text-gray-900 data-[state=open]:bg-gray-900/10"
            )}
            aria-label="Options"
            title="Options"
          >
            <Menu className="h-5 w-5" />
            {!!count && (
              <span
                aria-hidden
                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white/70"
              />
            )}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            collisionPadding={8}
            className="z-50 min-w-[12rem] overflow-hidden rounded-md border border-gray-300/70 bg-white/90 p-1 shadow-lg backdrop-blur-md"
          >
            <DropdownMenu.Item
              className={itemClass}
              // Stay open so the new show/hide state is visible.
              onSelect={(e) => {
                e.preventDefault();
                toggleHideLibraryAndWatched();
              }}
              title={
                hideLibraryAndWatched
                  ? "Library and watched titles are hidden — click to show"
                  : "Library and watched titles are visible — click to hide"
              }
            >
              {hideLibraryAndWatched ? (
                <EyeOff className="h-4 w-4 text-red-700" />
              ) : (
                <Eye className="h-4 w-4 text-emerald-700" />
              )}
              <span className="flex-1">Owned</span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs font-medium",
                  hideLibraryAndWatched
                    ? "bg-red-500/10 text-red-800"
                    : "bg-emerald-500/10 text-emerald-800"
                )}
              >
                {hideLibraryAndWatched ? "Hidden" : "Shown"}
              </span>
            </DropdownMenu.Item>
            <DropdownMenu.Item className={itemClass} onSelect={() => router.push("/reminders")}>
              <Bell className="h-4 w-4 text-amber-700" />
              <span className="flex-1">Reminders</span>
              {!!count && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-900">
                  {count}
                </span>
              )}
            </DropdownMenu.Item>
            {onChatOpen && (
              <DropdownMenu.Item className={itemClass} onSelect={onChatOpen}>
                <MessageSquare className="h-4 w-4" />
                <span className="flex-1">AI Chat</span>
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {weekItems && (
        <RemindersWeekPopup
          items={weekItems}
          anchorRef={anchorRef}
          onClose={closePopup}
          onItemsChange={setWeekItems}
        />
      )}
    </div>
  );
}
