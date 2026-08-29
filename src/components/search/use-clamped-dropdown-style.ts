"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

type ClampedDropdownAlign = "end" | "center";

/** Keep a dropdown fully on-screen on mobile by clamping fixed coordinates to the visual viewport. */
export function useClampedDropdownStyle(
  anchorRef: RefObject<HTMLElement | null>,
  active: boolean,
  maxWidth = 320,
  options?: { align?: ClampedDropdownAlign }
): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties | undefined>();
  const align = options?.align ?? "end";

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

      const vv = window.visualViewport;
      const vvTop = vv?.offsetTop ?? 0;
      const vvLeft = vv?.offsetLeft ?? 0;
      const vvWidth = vv?.width ?? window.innerWidth;
      const vvHeight = vv?.height ?? window.innerHeight;
      const rect = el.getBoundingClientRect();
      const gutter = 8;
      const width = Math.min(vvWidth - gutter * 2, maxWidth);
      const left =
        align === "center"
          ? vvLeft + (vvWidth - width) / 2
          : Math.min(
              Math.max(vvLeft + gutter, rect.right - width),
              vvLeft + vvWidth - width - gutter
            );
      const top = rect.bottom + gutter;
      const maxHeight = Math.max(96, vvTop + vvHeight - top - gutter);

      setStyle({
        position: "fixed",
        top,
        left,
        width,
        zIndex: 50,
        marginTop: 0,
        ...(align === "center" ? { maxHeight } : null),
      });
    }

    update();
    const vv = window.visualViewport;
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
    };
  }, [active, align, anchorRef, maxWidth]);

  return style;
}
