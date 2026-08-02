"use client";

import { useEffect } from "react";
import { useStandaloneDisplay } from "@/hooks/useStandaloneDisplay";

/** Applies standalone document class for home-screen chrome (safe areas / overscroll). */
export function PwaViewportGuard() {
  const { isStandalone } = useStandaloneDisplay();

  useEffect(() => {
    document.documentElement.classList.toggle("pwa-standalone", isStandalone);
    return () => document.documentElement.classList.remove("pwa-standalone");
  }, [isStandalone]);

  return null;
}
