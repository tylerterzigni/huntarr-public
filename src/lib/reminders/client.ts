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
  year: number | null;
  posterPath: string | null;
  trailerUrl: string | null;
  releases: UpcomingRelease[];
}

/** Official trailer when known, otherwise a YouTube search for it. */
export function reminderTrailerHref(item: {
  title: string;
  year: number | null;
  trailerUrl: string | null;
}): string {
  if (item.trailerUrl) return item.trailerUrl;
  const query = [item.title, item.year, "official trailer"].filter(Boolean).join(" ");
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
