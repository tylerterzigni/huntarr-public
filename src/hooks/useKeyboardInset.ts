"use client";

import { useEffect, useState } from "react";

function readKeyboardInset() {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
}

export function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!active) {
      setInset(0);
      return;
    }

    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => setInset(readKeyboardInset());

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);

    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      setInset(0);
    };
  }, [active]);

  return inset;
}

export function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
}
