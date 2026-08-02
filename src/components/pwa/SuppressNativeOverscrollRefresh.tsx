"use client";

import { useEffect } from "react";

function shouldIgnoreTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest("[data-allow-touch-scroll]") ||
      target.closest("[data-no-pull-refresh]") ||
      target.closest(".horizontal-scroll-row") ||
      target.closest("input, textarea, select, [contenteditable=true]")
  );
}

/**
 * Blocks iOS Safari's native pull-to-reload at the top of the page.
 * Custom pull-to-refresh was removed; logo tap does a full reload instead.
 * Nested scrollers (filters slide-over, etc.) are left alone.
 */
export function SuppressNativeOverscrollRefresh() {
  useEffect(() => {
    let tracking = false;
    let startY = 0;

    const onTouchStart = (event: TouchEvent) => {
      if (!window.matchMedia("(max-width: 767px)").matches) return;
      if (window.scrollY > 0) return;
      if (shouldIgnoreTarget(event.target)) return;
      tracking = true;
      startY = event.touches[0]?.clientY ?? 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking) return;
      if (shouldIgnoreTarget(event.target)) {
        tracking = false;
        return;
      }
      if (window.scrollY > 0) {
        tracking = false;
        return;
      }
      const currentY = event.touches[0]?.clientY ?? 0;
      if (currentY - startY > 4) {
        event.preventDefault();
      }
    };

    const onTouchEnd = () => {
      tracking = false;
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
  }, []);

  return null;
}
