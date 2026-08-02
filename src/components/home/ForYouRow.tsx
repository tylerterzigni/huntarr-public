"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaCard } from "@/components/media/MediaCard";
import { HorizontalScrollRow } from "@/components/media/HorizontalScrollRow";
import { MEDIA_CARD_WIDTH_PX } from "@/components/media/constants";
import { useLibraryWatchedVisibility } from "@/components/providers/LibraryWatchedVisibilityProvider";
import { HOME_ROW_LIMIT } from "@/lib/recommendations/constants";
import type { RecommendationItem } from "@/types";
import { HUNTARR_REFRESH_EVENT } from "@/lib/pwa/refresh";
import {
  HUNTARR_TITLE_HIDDEN_EVENT,
  matchesHiddenTitle,
  type TitleHiddenDetail,
} from "@/lib/hide-list/client";

const STAGGER_MS = 70;
const SKELETON_SLOTS = 10;

type StreamPayload = {
  items?: RecommendationItem[];
  done?: boolean;
};

function PosterSkeleton() {
  return (
    <div
      className="shrink-0 animate-pulse rounded-lg bg-seerr-card"
      style={{ width: MEDIA_CARD_WIDTH_PX, height: MEDIA_CARD_WIDTH_PX * 1.5 }}
      aria-hidden
    />
  );
}

export function ForYouRow() {
  const { selectVisibleRowItems } = useLibraryWatchedVisibility();
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const staggerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshCountRef = useRef(0);
  const refreshGenerationRef = useRef(0);
  const [rowEpoch, setRowEpoch] = useState(0);

  const visibleItems = useMemo(
    () => selectVisibleRowItems(items, HOME_ROW_LIMIT),
    [items, selectVisibleRowItems]
  );
  const slotCount = done
    ? visibleItems.length
    : Math.min(
        HOME_ROW_LIMIT,
        Math.max(SKELETON_SLOTS, visibleItems.length, revealedCount)
      );

  const stopStagger = useCallback(() => {
    if (staggerTimerRef.current) {
      clearInterval(staggerTimerRef.current);
      staggerTimerRef.current = null;
    }
  }, []);

  const startStagger = useCallback(
    (targetCount: number) => {
      stopStagger();
      if (targetCount <= 0) return;

      staggerTimerRef.current = setInterval(() => {
        setRevealedCount((prev) => {
          if (prev >= targetCount) {
            stopStagger();
            return prev;
          }
          return prev + 1;
        });
      }, STAGGER_MS);
    },
    [stopStagger]
  );

  const connect = useCallback(
    (refresh = false) => {
      eventSourceRef.current?.close();
      stopStagger();

      if (refresh) {
        refreshCountRef.current += 1;
        refreshGenerationRef.current += 1;
        setRowEpoch((epoch) => epoch + 1);
      }

      setItems([]);
      setRevealedCount(0);
      setDone(false);
      setLoading(true);

      const params = new URLSearchParams();
      if (refresh) {
        params.set("refresh", "1");
        params.set("gen", String(refreshGenerationRef.current));
      }
      if (refreshCountRef.current > 0) {
        params.set("recency", String(refreshCountRef.current));
      }
      params.set("_", String(Date.now()));

      const url = `/api/recommendations/for-you/stream?${params.toString()}`;

      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        const data = JSON.parse(event.data) as StreamPayload;
        const next = data.items ?? [];
        setItems(next);

        if (data.done) {
          setDone(true);
          setLoading(false);
          es.close();
          eventSourceRef.current = null;
          startStagger(Math.min(next.length, HOME_ROW_LIMIT));
        } else if (next.length > 0) {
          startStagger(Math.min(next.length, HOME_ROW_LIMIT));
        }
      };

      es.onerror = () => {
        setLoading(false);
        setDone(true);
        es.close();
        eventSourceRef.current = null;
      };
    },
    [startStagger, stopStagger]
  );

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
      stopStagger();
    };
  }, [connect, stopStagger]);

  useEffect(() => {
    const onRefresh = () => {
      // Avoid stacking an expensive refresh=1 reconnect on an in-flight stream —
      // that double load is a common iOS WebKit OOM trigger with pull-to-refresh.
      if (!done && loading) return;
      connect(true);
    };
    window.addEventListener(HUNTARR_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(HUNTARR_REFRESH_EVENT, onRefresh);
  }, [connect, done, loading]);

  useEffect(() => {
    function onTitleHidden(event: Event) {
      const detail = (event as CustomEvent<TitleHiddenDetail>).detail;
      if (!detail) return;
      setItems((prev) => prev.filter((item) => !matchesHiddenTitle(item, detail)));
      setRevealedCount((prev) => Math.max(0, prev - 1));
    }
    window.addEventListener(HUNTARR_TITLE_HIDDEN_EVENT, onTitleHidden);
    return () => window.removeEventListener(HUNTARR_TITLE_HIDDEN_EVENT, onTitleHidden);
  }, []);

  useEffect(() => {
    if (visibleItems.length > revealedCount && !staggerTimerRef.current) {
      startStagger(visibleItems.length);
    }
  }, [visibleItems.length, revealedCount, startStagger]);

  if (done && visibleItems.length === 0) return null;

  return (
    <section
      className="mb-5 md:mb-10"
      aria-busy={loading && !done}
      data-huntarr-loading={loading && !done ? "true" : undefined}
    >
      <div className="mb-2 px-4 md:mb-4 md:px-8">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-gray-900">For You</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-gray-600 hover:text-gray-900"
            onClick={() => connect(true)}
            disabled={loading && !done}
            aria-label="Refresh For You recommendations"
            title="Refresh recommendations"
          >
            {loading && !done ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Personalized recommendations based on your taste
        </p>
      </div>
      {(loading || visibleItems.length > 0) && (
        <HorizontalScrollRow className="px-4 pb-2 md:px-8 md:pb-4">
          {Array.from({ length: slotCount }).map((_, index) => {
            if (index < revealedCount && index < visibleItems.length) {
              const item = visibleItems[index];
              return (
                <MediaCard
                  key={`${item.id}-${rowEpoch}`}
                  item={item}
                  onHidden={() => {
                    setItems((prev) => prev.filter((entry) => entry.id !== item.id));
                    setRevealedCount((prev) => Math.max(0, prev - 1));
                  }}
                />
              );
            }

            if (!done || index >= visibleItems.length) {
              return <PosterSkeleton key={`skeleton-${index}`} />;
            }

            return null;
          })}
        </HorizontalScrollRow>
      )}
    </section>
  );
}
