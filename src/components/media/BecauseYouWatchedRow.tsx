"use client";

import { useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BecauseYouWatchedSeedSearch } from "./BecauseYouWatchedSeedSearch";
import { MediaRowScroller } from "./MediaRowScroller";
import type { MediaType, RecommendationItem } from "@/types";

interface BecauseYouWatchedRowProps {
  initialSeedTitle: string;
  initialSeedIndex: number;
  seedCount: number;
  initialItems: RecommendationItem[];
}

export function BecauseYouWatchedRow({
  initialSeedTitle,
  initialSeedIndex,
  seedCount,
  initialItems,
}: BecauseYouWatchedRowProps) {
  const [seedTitle, setSeedTitle] = useState(initialSeedTitle);
  const [seedIndex, setSeedIndex] = useState(initialSeedIndex);
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);

  if (items.length === 0) return null;

  async function loadSeedRecommendations(params: URLSearchParams) {
    setLoading(true);
    try {
      const res = await fetch(`/api/recommendations?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data?.seedTitle) return;

      setSeedTitle(data.seedTitle);
      setSeedIndex(data.seedIndex);
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function rotateSeed() {
    if (seedCount <= 1 || loading) return;

    const nextIndex = (seedIndex + 1) % seedCount;
    const params = new URLSearchParams({
      type: "because-you-watched",
      seedIndex: String(nextIndex),
    });
    await loadSeedRecommendations(params);
  }

  async function selectSeedFromHistory(seed: {
    tmdbId: number;
    mediaType: MediaType;
    title: string;
  }) {
    if (loading) return;

    const params = new URLSearchParams({
      type: "because-you-watched",
      seedTmdbId: String(seed.tmdbId),
      seedMediaType: seed.mediaType,
    });
    await loadSeedRecommendations(params);
  }

  return (
    <section className="mb-5 md:mb-10">
      <div className="mb-2 flex items-center gap-2 px-4 md:mb-4 md:px-8">
        <h2 className="text-xl font-semibold text-gray-900">
          Because You Watched {seedTitle}
        </h2>
        {seedCount > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-gray-600 hover:text-gray-900"
            onClick={rotateSeed}
            disabled={loading}
            aria-label="Show recommendations based on a different watched title"
            title="Try another watched movie or show"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        )}
        <BecauseYouWatchedSeedSearch onSelect={selectSeedFromHistory} disabled={loading} />
      </div>
      <MediaRowScroller
        className="px-4 pb-2 md:px-8 md:pb-4"
        items={items}
        showReason={false}
      />
    </section>
  );
}
