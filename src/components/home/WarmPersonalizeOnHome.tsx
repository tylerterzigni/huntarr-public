"use client";

import { useEffect } from "react";

/** Pre-load taste/filter data when the home page mounts. */
export function WarmPersonalizeOnHome() {
  useEffect(() => {
    void fetch("/api/recommendations/personalize-browse/warm", { cache: "no-store" });
  }, []);

  return null;
}
