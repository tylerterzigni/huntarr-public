"use client";

import { useEffect, useState } from "react";
import { isStandaloneDisplay } from "@/lib/pwa/display-mode";

export function useStandaloneDisplay(): { isStandalone: boolean } {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setIsStandalone(isStandaloneDisplay());

    const media = window.matchMedia("(display-mode: standalone)");
    const onChange = () => setIsStandalone(isStandaloneDisplay());
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return { isStandalone };
}
