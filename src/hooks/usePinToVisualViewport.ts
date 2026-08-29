"use client";

import { useLayoutEffect } from "react";

/**
 * iOS Safari/PWA pans `visualViewport` when the keyboard opens on a scrolled
 * page, which hides `position: sticky` headers (and any focused input in them).
 * While `active` on mobile, pin the element to the visible viewport.
 */
export function usePinToVisualViewport(
  getElement: () => HTMLElement | null,
  active: boolean
) {
  useLayoutEffect(() => {
    if (!active) return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;

    const el = getElement();
    if (!el) return;
    const header: HTMLElement = el;

    const vv = window.visualViewport;
    const saved = {
      position: header.style.position,
      top: header.style.top,
      left: header.style.left,
      right: header.style.right,
      width: header.style.width,
      zIndex: header.style.zIndex,
    };

    const placeholder = document.createElement("div");
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.style.height = `${header.offsetHeight}px`;
    placeholder.style.flexShrink = "0";
    header.parentNode?.insertBefore(placeholder, header);

    function update() {
      const vvTop = vv?.offsetTop ?? 0;
      header.style.position = "fixed";
      header.style.top = `${vvTop}px`;
      header.style.left = "0";
      header.style.right = "0";
      header.style.width = "100%";
      header.style.zIndex = "50";
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      header.style.position = saved.position;
      header.style.top = saved.top;
      header.style.left = saved.left;
      header.style.right = saved.right;
      header.style.width = saved.width;
      header.style.zIndex = saved.zIndex;
      placeholder.remove();
    };
  }, [active, getElement]);
}
