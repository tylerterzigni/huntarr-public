import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    /*
     * Auth runs on all routes except public assets (no session required):
     * - login, register — auth pages
     * - api/auth, api/health — NextAuth + health probe
     * - _next/static, _next/image — Next.js internals
     * - favicon.ico, icon, apple-icon — app icons (App Router metadata routes)
     * - huntarr-logo.png, placeholder-poster.svg — static branding / TMDB fallback
     * - manifest.webmanifest, site.webmanifest — PWA install manifest (iOS fetches without cookies)
     * - sw.js — service worker (must not redirect to /login)
     * - offline.html — SW offline fallback page
     * - icons — generated PWA install icons under public/icons/
     */
    "/((?!login|register|api/auth|api/health|_next/static|_next/image|favicon.ico|icon|apple-icon|huntarr-logo.png|placeholder-poster.svg|manifest.webmanifest|site.webmanifest|sw.js|offline.html|icons).*)",
  ],
};
