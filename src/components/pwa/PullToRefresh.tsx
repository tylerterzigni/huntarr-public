"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { dispatchHuntarrRefresh } from "@/lib/pwa/refresh";

const PULL_THRESHOLD = 80;
const MAX_PULL = 140;
const REFRESH_HOLD_MS = 700;
const INDICATOR_SIZE = 28;

interface PullToRefreshProps {
  children: React.ReactNode;
  disabled?: boolean;
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 767px)").matches;
}

function shouldIgnorePullTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(".horizontal-scroll-row") ||
      target.closest("[data-no-pull-refresh]") ||
      target.closest("input, textarea, select, [contenteditable=true]")
  );
}

function rubberBand(distance: number, max: number) {
  if (distance <= max) return distance;
  return max + (distance - max) * 0.25;
}

export function PullToRefresh({ children, disabled = false }: PullToRefreshProps) {
  const router = useRouter();
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const setPull = useCallback((distance: number) => {
    pullDistanceRef.current = distance;
    setPullDistance(distance);
  }, []);

  const triggerRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setPull(PULL_THRESHOLD);

    dispatchHuntarrRefresh();
    router.refresh();

    await new Promise((resolve) => setTimeout(resolve, REFRESH_HOLD_MS));

    refreshingRef.current = false;
    setRefreshing(false);
    setPull(0);
  }, [router, setPull]);

  useEffect(() => {
    const onTouchStart = (event: TouchEvent) => {
      if (disabledRef.current || !isMobileViewport() || refreshingRef.current) return;
      if (window.scrollY > 0) return;
      if (shouldIgnorePullTarget(event.target)) return;

      startYRef.current = event.touches[0]?.clientY ?? 0;
      pullingRef.current = true;
      setIsPulling(true);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pullingRef.current || refreshingRef.current) return;
      if (window.scrollY > 0) {
        pullingRef.current = false;
        setIsPulling(false);
        setPull(0);
        return;
      }

      const currentY = event.touches[0]?.clientY ?? 0;
      const delta = currentY - startYRef.current;
      if (delta <= 0) {
        setPull(0);
        return;
      }

      if (delta > 4) {
        event.preventDefault();
      }

      setPull(rubberBand(delta, MAX_PULL));
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      setIsPulling(false);

      if (pullDistanceRef.current >= PULL_THRESHOLD) {
        void triggerRefresh();
        return;
      }

      setPull(0);
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [setPull, triggerRefresh]);

  const offset = refreshing ? PULL_THRESHOLD : pullDistance;
  const progress = Math.min(offset / PULL_THRESHOLD, 1);
  const showIndicator = offset > 8;

  return (
    <div className="relative md:contents">
      <div
        aria-hidden
        aria-live="polite"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-50 flex items-end justify-center md:hidden",
          showIndicator ? "opacity-100" : "opacity-0"
        )}
        style={{
          height: Math.max(offset, 0),
          paddingTop: "var(--safe-area-top)",
          paddingBottom: 6,
          transition: isPulling || refreshing ? "none" : "height 0.3s ease, opacity 0.2s ease",
        }}
      >
        <Loader2
          className={cn("text-gray-500", refreshing && "animate-spin")}
          style={{
            width: INDICATOR_SIZE * (0.55 + progress * 0.45),
            height: INDICATOR_SIZE * (0.55 + progress * 0.45),
            opacity: 0.35 + progress * 0.65,
            transform: refreshing ? undefined : `rotate(${progress * 300}deg)`,
          }}
        />
      </div>

      <div
        className="md:contents"
        style={{
          transform: offset > 0 ? `translateY(${offset}px)` : undefined,
          transition: isPulling || refreshing ? "none" : "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
