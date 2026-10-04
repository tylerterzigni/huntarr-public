/** Client-safe reminder helpers (no DB imports). */

export const REMINDERS_CHANGED_EVENT = "huntarr:reminders-changed";

/** Tell the navbar Reminders button to refresh its count. */
export function dispatchRemindersChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT));
}

export interface UpcomingRelease {
  /** YYYY-MM-DD */
  date: string;
  /** "Digital", "Theatrical", or an episode code like "S2E5". */
  label: string;
}

export interface UpcomingReminder {
  id: string;
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  releases: UpcomingRelease[];
}
