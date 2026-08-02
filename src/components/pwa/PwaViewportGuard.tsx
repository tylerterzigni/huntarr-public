"use client";

import { useEffect } from "react";
import { useStandaloneDisplay } from "@/hooks/useStandaloneDisplay";

/** Applies PWA-only document classes for full-screen feel and zoom prevention. */
export function PwaViewportGuard() {
  const { isStandalone } = useStandaloneDisplay();

  useEffect(() => {
    document.documentElement.classList.toggle("pwa-standalone", isStandalone);
    return () => document.documentElement.classList.remove("pwa-standalone");
  }, [isStandalone]);

  return null;
}
