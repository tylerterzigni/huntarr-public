"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  RemindersWeekPopup,
  pickThisWeek,
  type WeekReminder,
} from "@/components/layout/RemindersWeekPopup";
import { REMINDERS_CHANGED_EVENT, type UpcomingReminder } from "@/lib/reminders/client";
import { cn } from "@/lib/utils";

interface RemindersButtonProps {
  lightNav?: boolean;
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

export function RemindersButton({ lightNav = false }: RemindersButtonProps) {
  const active = usePathname() === "/reminders";
  const anchorRef = useRef<HTMLDivElement>(null);
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

  // Hidden until there is something on the list (but always reachable on its own page).
  if (!active && !count) return null;

  return (
    <div ref={anchorRef} className="relative shrink-0">
      <Link
        href="/reminders"
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          lightNav
            ? "border-amber-300/40 bg-amber-400/15 text-white hover:bg-amber-400/25 hover:text-white"
            : "border-amber-300/80 bg-amber-500/10 text-amber-900 hover:bg-amber-500/15 hover:text-amber-950",
          active && (lightNav ? "bg-amber-400/30" : "bg-amber-500/20")
        )}
        aria-current={active ? "page" : undefined}
        aria-label="Reminders"
        title="Reminders"
      >
        <Bell className="h-4 w-4 sm:mr-1" />
        <span className="hidden sm:inline">Reminders</span>
      </Link>
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
