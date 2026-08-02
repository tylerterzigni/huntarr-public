"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterSlideover } from "@/components/discover/FilterSlideover";
import { countActiveFilters } from "@/components/discover/filter-utils";

interface KeywordItem {
  id: number;
  name: string;
}

interface DiscoverFiltersProps {
  genres: Array<{ id: number; name: string }>;
  mediaType: "movie" | "tv";
  initialKeywords?: KeywordItem[];
  initialExcludeKeywords?: KeywordItem[];
}

/** Survives RSC remounts while the user is still editing filters. */
const filterPanelOpen: Record<"movie" | "tv", boolean> = {
  movie: false,
  tv: false,
};

export function DiscoverFilters({
  genres,
  mediaType,
  initialKeywords = [],
  initialExcludeKeywords = [],
}: DiscoverFiltersProps) {
  const searchParams = useSearchParams();
  const [showFilters, setShowFilters] = useState(() => filterPanelOpen[mediaType]);
  const activeCount = countActiveFilters(searchParams, mediaType);

  useEffect(() => {
    filterPanelOpen[mediaType] = showFilters;
  }, [showFilters, mediaType]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowFilters(true)}
        className="shrink-0 border-gray-300/70 bg-white/40 backdrop-blur-md hover:border-gray-400 hover:bg-white/55"
      >
        <Filter className="h-4 w-4 mr-2" />
        {activeCount > 0
          ? `${activeCount} Active Filter${activeCount === 1 ? "" : "s"}`
          : "Filters"}
      </Button>
      <FilterSlideover
        open={showFilters}
        onClose={() => setShowFilters(false)}
        genres={genres}
        mediaType={mediaType}
        initialKeywords={initialKeywords}
        initialExcludeKeywords={initialExcludeKeywords}
      />
    </>
  );
}
