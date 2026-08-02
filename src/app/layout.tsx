import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Providers from "@/components/providers/SessionProvider";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { PwaViewportGuard } from "@/components/pwa/PwaViewportGuard";
import { viewport } from "./viewport";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

/** Next only picks up viewport from layout/page — re-export so mobile zoom lock is applied. */
export { viewport };

export const metadata: Metadata = {
  title: "Huntarr",
  description: "Intelligent media discovery with Radarr, Sonarr, Plex, and Tautulli",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Huntarr",
  },
  icons: {
    icon: [
      { url: "/icons/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <PwaViewportGuard />
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
