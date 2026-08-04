"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  PAGE_BODY_BRIGHTNESS,
  sampleTopStripBrightness,
  whiteTextMixFromBrightness,
} from "@/lib/media/backdrop-brightness";

interface DetailNavContrastValue {
  /**
   * 0 = dark grey nav text, 1 = white nav text.
   * Blends from fanart brightness at the top toward the light page body while scrolling.
   */
  whiteTextMix: number;
  /** Discrete helper for controls that still take a boolean lightNav prop. */
  lightNav: boolean;
  reportBackdropUrl: (url: string | null) => void;
  reportBackdropElement: (element: HTMLElement | null) => void;
}

const DetailNavContrastContext = createContext<DetailNavContrastValue | null>(null);

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export function DetailNavContrastProvider({ children }: { children: ReactNode }) {
  const [fanartBrightness, setFanartBrightness] = useState<number | null>(null);
  const [whiteTextMix, setWhiteTextMix] = useState(0);
  const [watching, setWatching] = useState(false);
  const [backdropElement, setBackdropElement] = useState<HTMLElement | null>(null);
  const requestIdRef = useRef(0);
  const fanartBrightnessRef = useRef<number | null>(null);

  const recompute = useCallback(() => {
    const fanart = fanartBrightnessRef.current;
    if (fanart == null) {
      setWhiteTextMix(0);
      return;
    }

    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const hero = backdropElement;
    // Fade across roughly the hero height so text tracks the fanart → page blend.
    const fadeDistance = Math.max(
      120,
      (hero?.offsetHeight ?? 360) * 0.55
    );
    const scrollT = clamp01(scrollY / fadeDistance);
    const effective =
      fanart * (1 - scrollT) + PAGE_BODY_BRIGHTNESS * scrollT;
    setWhiteTextMix(whiteTextMixFromBrightness(effective));
  }, [backdropElement]);

  const reportBackdropUrl = useCallback(
    (url: string | null) => {
      const requestId = ++requestIdRef.current;

      if (!url) {
        fanartBrightnessRef.current = null;
        setFanartBrightness(null);
        setWatching(false);
        setWhiteTextMix(0);
        return;
      }

      setWatching(true);

      void sampleTopStripBrightness(url).then((brightness) => {
        if (requestId !== requestIdRef.current) return;
        // Fall back to a mid-dark value so unknown samples still prefer white at top.
        const value = brightness ?? 90;
        fanartBrightnessRef.current = value;
        setFanartBrightness(value);
      });
    },
    []
  );

  const reportBackdropElement = useCallback((element: HTMLElement | null) => {
    setBackdropElement(element);
  }, []);

  useEffect(() => {
    if (!watching) return;

    recompute();
    window.addEventListener("scroll", recompute, { passive: true });
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("scroll", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, [watching, recompute, fanartBrightness]);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
    };
  }, []);

  const lightNav = whiteTextMix >= 0.45;

  return (
    <DetailNavContrastContext.Provider
      value={{ whiteTextMix, lightNav, reportBackdropUrl, reportBackdropElement }}
    >
      {children}
    </DetailNavContrastContext.Provider>
  );
}

export function useDetailNavContrast() {
  const context = useContext(DetailNavContrastContext);
  if (!context) {
    throw new Error("useDetailNavContrast must be used within DetailNavContrastProvider");
  }
  return context;
}

/** Optional hook for pages that are not under a detail backdrop — safe no-op defaults. */
export function useDetailNavContrastOptional(): DetailNavContrastValue {
  const context = useContext(DetailNavContrastContext);
  return (
    context ?? {
      whiteTextMix: 0,
      lightNav: false,
      reportBackdropUrl: () => {},
      reportBackdropElement: () => {},
    }
  );
}
