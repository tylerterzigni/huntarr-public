"use client";

import { useEffect, useRef } from "react";

export function ServiceWorkerRegister() {
  const registeredRef = useRef(false);

  useEffect(() => {
    if (registeredRef.current || !("serviceWorker" in navigator)) {
      return;
    }

    registeredRef.current = true;
    let reloaded = false;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((error) => {
        console.warn("[Huntarr PWA] Service worker registration failed:", error);
      });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }, []);

  return null;
}
