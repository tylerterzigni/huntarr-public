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

/** Parse a YYYY-MM-DD date as local midnight (not UTC, which can shift the day). */
export function parseLocalDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** e.g. "Oct 14, 2026" */
export function formatReleaseDate(date: string) {
  return parseLocalDate(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Today's local date as YYYY-MM-DD. */
export function localToday(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Soonest release first: upcoming dates (today onward) ascending, then already-released dates
 * newest first, then titles with no known date.
 */
export function compareReleaseDates(a: string | null, b: string | null, today = localToday()) {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  const aUpcoming = a >= today;
  const bUpcoming = b >= today;
  if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
  return aUpcoming ? a.localeCompare(b) : b.localeCompare(a);
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
