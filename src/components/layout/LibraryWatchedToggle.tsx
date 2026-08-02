"use client";

import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLibraryWatchedVisibility } from "@/components/providers/LibraryWatchedVisibilityProvider";
import { cn } from "@/lib/utils";

interface LibraryWatchedToggleProps {
  lightNav?: boolean;
}

export function LibraryWatchedToggle({ lightNav = false }: LibraryWatchedToggleProps) {
  const { hideLibraryAndWatched, toggleHideLibraryAndWatched } = useLibraryWatchedVisibility();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggleHideLibraryAndWatched}
      className={cn(
        "shrink-0",
        lightNav
          ? hideLibraryAndWatched
            ? "border-red-400/40 bg-red-500/15 text-white hover:bg-red-500/25 hover:text-white"
            : "border-emerald-400/40 bg-emerald-500/15 text-white hover:bg-emerald-500/25 hover:text-white"
          : hideLibraryAndWatched
            ? "border-red-300/80 bg-red-500/10 text-red-800 hover:bg-red-500/15 hover:text-red-900"
            : "border-emerald-300/80 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/15 hover:text-emerald-900"
      )}
      aria-pressed={!hideLibraryAndWatched}
      aria-label={
        hideLibraryAndWatched
          ? "Show Plex library and watched titles"
          : "Hide Plex library and watched titles"
      }
      title={
        hideLibraryAndWatched
          ? "Library and watched titles are hidden — click to show"
          : "Library and watched titles are visible — click to hide"
      }
    >
      {hideLibraryAndWatched ? (
        <EyeOff className="h-4 w-4 sm:mr-1" />
      ) : (
        <Eye className="h-4 w-4 sm:mr-1" />
      )}
      <span className="hidden sm:inline">Owned</span>
    </Button>
  );
}
