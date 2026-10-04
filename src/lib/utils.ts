import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function posterUrl(path: string | null | undefined, size: "w185" | "w342" | "w500" | "original" = "w342") {
  if (!path) return "/placeholder-poster.svg";
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export function backdropUrl(path: string | null | undefined) {
  if (!path) return null;
  // Seerr-style cinematic crop (1920×800) — fits ultrawide banners better than raw 16:9
  return `https://image.tmdb.org/t/p/w1920_and_h800_multi_faces${path}`;
}

export function providerLogoUrl(path: string | null | undefined) {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/w45${path}`;
}

export function profileUrl(path: string | null | undefined, size: "w185" | "w342" = "w185") {
  if (!path) return "/placeholder-poster.svg";
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export function formatRuntime(minutes: number | null | undefined) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatYear(date: string | null | undefined) {
  if (!date) return null;
  return date.slice(0, 4);
}

export function formatAirDate(
  date: string | null | undefined,
  month: "long" | "short" = "long"
) {
  if (!date) return null;
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    month,
    day: "numeric",
    year: "numeric",
  });
}

export function stillUrl(path: string | null | undefined, size: "w300" | "w780" = "w300") {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export function episodeAvailabilityKey(seasonNumber: number, episodeNumber: number) {
  return `${seasonNumber}:${episodeNumber}`;
}
