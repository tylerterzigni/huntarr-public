"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";

const STORAGE_KEY = "huntarr:last-daily-sync";

/** Survives React Strict Mode remounts within the same JS context. */
let dailySyncRequestedFor: string | null = null;

function localDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * On the first authenticated app load of the local calendar day, kicks off
 * Plex library + Tautulli watch-history sync in the background (no UI block).
 */
export function DailySyncTrigger() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;

    const today = localDateKey();
    if (dailySyncRequestedFor === today) return;

    try {
      if (window.localStorage.getItem(STORAGE_KEY) === today) {
        dailySyncRequestedFor = today;
        return;
      }
    } catch {
      // localStorage may be unavailable; still ask the server to dedupe.
    }

    dailySyncRequestedFor = today;

    void fetch("/api/sync/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: today }),
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          dailySyncRequestedFor = null;
          return;
        }
        const data = (await res.json().catch(() => null)) as {
          started?: boolean;
          skipped?: boolean;
        } | null;
        if (data?.started || data?.skipped) {
          try {
            window.localStorage.setItem(STORAGE_KEY, today);
          } catch {
            // ignore
          }
        } else {
          dailySyncRequestedFor = null;
        }
      })
      .catch(() => {
        dailySyncRequestedFor = null;
      });
  }, [status]);

  return null;
}
