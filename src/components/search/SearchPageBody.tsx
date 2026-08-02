"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { MediaCard } from "@/components/media/MediaCard";
import { PersonCard } from "@/components/media/PersonCard";
import { Button } from "@/components/ui/button";
import { mediaItemKey } from "@/lib/integrations/tmdb/helpers";
import type { SearchPeopleResult } from "@/lib/search/run-search";
import type { RecommendationItem } from "@/types";

interface SearchPageBodyProps {
  query: string;
  initialItems: RecommendationItem[];
  initialPeople?: SearchPeopleResult[];
  totalPages: number;
}

export function SearchPageBody({
  query,
  initialItems,
  initialPeople = [],
  totalPages: initialTotalPages,
}: SearchPageBodyProps) {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");

  const people = initialPeople;

  const loadMore = useCallback(async () => {
    const nextPage = page + 1;
    if (nextPage > totalPages || loadingMore || !query.trim()) return;

    setLoadingMore(true);
    setLoadMoreError("");

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(query)}&page=${nextPage}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load more");

      setItems((prev) => {
        const seen = new Set(prev.map((item) => mediaItemKey(item)));
        const nextItems = (data.results ?? []).filter(
          (item: RecommendationItem) => !seen.has(mediaItemKey(item))
        );
        return [...prev, ...nextItems];
      });
      setPage(nextPage);
      setTotalPages(data.total_pages ?? totalPages);
    } catch (err) {
      setLoadMoreError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [page, totalPages, loadingMore, query]);

  const title = query.trim() ? `Search: "${query.trim()}"` : "Search";

  if (!query.trim()) {
    return (
      <div className="px-4 md:px-8 py-8">
        <h1 className="text-2xl font-bold mb-6">{title}</h1>
        <p className="text-muted-foreground">Enter a search term in the navbar to find movies and TV shows.</p>
      </div>
    );
  }

  const hasResults = people.length > 0 || items.length > 0;

  return (
    <div className="px-4 md:px-8 py-8">
      <h1 className="text-2xl font-bold mb-6">{title}</h1>

      {!hasResults ? (
        <p className="text-muted-foreground">No results found.</p>
      ) : (
        <div className="space-y-8">
          {people.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">People</h2>
              <div className="flex flex-wrap gap-4">
                {people.map((person) => (
                  <PersonCard
                    key={person.id}
                    id={person.id}
                    name={person.name}
                    profilePath={person.profile_path}
                    subtitle={
                      person.familiarLabel ??
                      person.known_for_department
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {items.length > 0 && (
            <section className="space-y-6">
              <p className="text-sm text-muted-foreground">
                Showing {items.length} title{items.length === 1 ? "" : "s"}
              </p>
              <div className="grid grid-cols-[repeat(auto-fill,160px)] justify-start gap-x-4 gap-y-6">
                {items.map((item) => (
                  <MediaCard
                    key={mediaItemKey(item)}
                    item={item}
                    layout="grid"
                    showReason={false}
                    onHidden={() =>
                      setItems((prev) =>
                        prev.filter((entry) => mediaItemKey(entry) !== mediaItemKey(item))
                      )
                    }
                  />
                ))}
              </div>
              {loadMoreError && <p className="text-red-400 text-sm">{loadMoreError}</p>}
              {page < totalPages && (
                <div className="flex justify-center">
                  <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      "Load more"
                    )}
                  </Button>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
