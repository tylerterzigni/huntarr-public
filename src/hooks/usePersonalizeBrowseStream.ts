"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { streamPersonalizeBrowse } from "@/lib/recommendations/personalize-stream-client";
import type { RecommendationItem } from "@/types";

type PersonalizeStreamMode = "home" | "discover";

export function usePersonalizeBrowseStream(options: { mode?: PersonalizeStreamMode } = {}) {
  const [personalized, setPersonalized] = useState(false);
  const [items, setItems] = useState<RecommendationItem[] | null>(null);
  /** True only until the first sorted results are ready to display. */
  const [initializing, setInitializing] = useState(false);
  /** True while AI refinement continues after the grid is already visible. */
  const [refining, setRefining] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState<{ ranked: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [revealedCount, setRevealedCount] = useState(0);
  const readyRef = useRef(false);

  const markReady = useCallback((nextItems: RecommendationItem[]) => {
    if (readyRef.current) return;
    readyRef.current = true;
    setItems(nextItems);
    setRevealedCount(nextItems.length);
    setInitializing(false);
    setRefining(true);
    setProgress(null);
  }, []);

  const reset = useCallback(() => {
    readyRef.current = false;
    setPersonalized(false);
    setItems(null);
    setInitializing(false);
    setRefining(false);
    setDone(false);
    setProgress(null);
    setError("");
    setRevealedCount(0);
  }, []);

  const run = useCallback(
    async (sourceItems: RecommendationItem[]) => {
      readyRef.current = false;
      setPersonalized(true);
      setItems(null);
      setInitializing(true);
      setRefining(false);
      setDone(false);
      setProgress(null);
      setError("");
      setRevealedCount(0);

      try {
        await streamPersonalizeBrowse(sourceItems, {
          onEvent: (event) => {
            if (event.done) {
              setDone(true);
              setInitializing(false);
              setRefining(false);
              setProgress(null);
              setItems(event.items);
              setRevealedCount(event.items.length);
              readyRef.current = true;
              return;
            }

            if (event.progress?.ranked === 0 && event.items.length > 0) {
              markReady(event.items);
              return;
            }

            if (readyRef.current) {
              setItems(event.items);
            }
          },
        });
      } catch (err) {
        readyRef.current = false;
        setPersonalized(false);
        setInitializing(false);
        setRefining(false);
        setProgress(null);
        setRevealedCount(0);
        setError(err instanceof Error ? err.message : "Failed to personalize results");
        throw err;
      }
    },
    [markReady]
  );

  useEffect(() => {
    return () => {
      readyRef.current = false;
    };
  }, []);

  const activateCached = useCallback(() => {
    setPersonalized(true);
    setInitializing(false);
    setRefining(false);
    if (items) {
      setRevealedCount(items.length);
    }
  }, [items]);

  const deactivate = useCallback(() => {
    setPersonalized(false);
  }, []);

  return {
    personalized,
    items,
    /** Spinner on the person icon — only during initial load, not AI refinement. */
    loading: initializing,
    initializing,
    refining,
    done,
    progress,
    error,
    revealedCount,
    run,
    reset,
    activateCached,
    deactivate,
    setItems,
    setError,
  };
}
