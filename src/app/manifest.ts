import type { MetadataRoute } from "next";

const ICONS = [
  {
    src: "/icons/android-chrome-192x192.png",
    sizes: "192x192",
    type: "image/png",
    purpose: "any",
  },
  {
    src: "/icons/android-chrome-512x512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "any",
  },
  {
    src: "/icons/android-chrome-192x192_maskable.png",
    sizes: "192x192",
    type: "image/png",
    purpose: "maskable",
  },
  {
    src: "/icons/android-chrome-512x512_maskable.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
] as const;

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Huntarr",
    short_name: "Huntarr",
    description: "Intelligent media discovery with Radarr, Sonarr, Plex, and Tautulli",
    start_url: "/",
    display: "standalone",
    background_color: "#e5e7eb",
    theme_color: "#e5e7eb",
    icons: [...ICONS],
    shortcuts: [
      {
        name: "Home",
        url: "/",
        icons: [{ src: "/icons/shortcut-home-192x192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Movies",
        url: "/movies",
        icons: [{ src: "/icons/shortcut-movies-192x192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "TV Shows",
        url: "/tv",
        icons: [{ src: "/icons/shortcut-tv-192x192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Settings",
        url: "/settings",
        icons: [{ src: "/icons/shortcut-settings-192x192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
