"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

/** Keep a dropdown fully on-screen on mobile by clamping fixed coordinates to the viewport. */
export function useClampedDropdownStyle(
  anchorRef: RefObject<HTMLElement | null>,
  active: boolean,
  maxWidth = 320
): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties | undefined>();

  useLayoutEffect(() => {
    if (!active) {
      setStyle(undefined);
      return;
    }

    function update() {
      const el = anchorRef.current;
      if (!el) return;

      const isMobile = window.matchMedia("(max-width: 767px)").matches;
      if (!isMobile) {
        setStyle(undefined);
        return;
      }

      const rect = el.getBoundingClientRect();
      const gutter = 8;
      const width = Math.min(window.innerWidth - gutter * 2, maxWidth);
      // Prefer aligning to the trigger's right edge (common for these search icons).
      const preferredLeft = rect.right - width;
      const left = Math.min(
        Math.max(gutter, preferredLeft),
        window.innerWidth - width - gutter
      );

      setStyle({
        position: "fixed",
        top: Math.min(rect.bottom + gutter, window.innerHeight - gutter),
        left,
        width,
        zIndex: 50,
        marginTop: 0,
      });
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, anchorRef, maxWidth]);

  return style;
}
