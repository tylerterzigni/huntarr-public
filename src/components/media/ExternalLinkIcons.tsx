import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function LinkIcon({
  href,
  label,
  children,
  className,
}: {
  href: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md transition-opacity hover:opacity-80",
        className
      )}
    >
      {children}
    </a>
  );
}

export function PlexLinkIcon({ href }: { href: string }) {
  return (
    <LinkIcon href={href} label="Plex">
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path
          fill="#e5a00d"
          d="M11.643 23.997H.002V12.356L11.643.715v23.282zM12.356 23.997V.715L23.997 12.356 12.356 23.997z"
        />
      </svg>
    </LinkIcon>
  );
}

export function TmdbLinkIcon({ href }: { href: string }) {
  return (
    <LinkIcon href={href} label="The Movie Database">
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <rect width="24" height="24" rx="4" fill="#0d253f" />
        <path
          fill="#01d277"
          d="M6.5 16.5V7.5h2.1l2.4 4.8 2.4-4.8h2.1v9h-1.8v-5.8l-2.2 4.4h-1.2l-2.2-4.4v5.8H6.5zm9.8 0V7.5h4.2v1.6h-2.4v1.8h2.2v1.6h-2.2v2.9h-1.8z"
        />
      </svg>
    </LinkIcon>
  );
}

export function ImdbLinkIcon({ href }: { href: string }) {
  return (
    <LinkIcon href={href} label="IMDb">
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <rect width="24" height="24" rx="4" fill="#f5c518" />
        <path
          fill="#000"
          d="M4 7.5h2.2l.6 3.4.6-3.4H9v9H7.8v-5.6L7 14.5H5.8l-.8-3.6V16.5H4V7.5zm6.2 0h1.8v7.2h2.4l.4-7.2H16l-.5 9h-2.6l-.3-5.8-.3 5.8H10l-.5-9h.7zm6.8 0H20v9h-1.8l-.2-5.9-.2 5.9h-1.8V7.5z"
        />
      </svg>
    </LinkIcon>
  );
}

export function RottenTomatoesLinkIcon({ href }: { href: string }) {
  return (
    <LinkIcon href={href} label="Rotten Tomatoes">
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <circle cx="12" cy="12" r="11" fill="#fa320a" />
        <circle cx="12" cy="12" r="7.5" fill="#0ac855" />
      </svg>
    </LinkIcon>
  );
}

export function TraktLinkIcon({ href }: { href: string }) {
  return (
    <LinkIcon href={href} label="Trakt">
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <rect width="24" height="24" rx="4" fill="#ed1c24" />
        <path
          fill="#fff"
          d="M7 8.5 12 6l5 2.5V16l-5 2.5L7 16V8.5zm2.2 1.4v4.2L12 14.8l2.8-1.7V9.9L12 8.2l-2.8 1.7z"
        />
      </svg>
    </LinkIcon>
  );
}

export function TvdbLinkIcon({ href }: { href: string }) {
  return (
    <LinkIcon href={href} label="TheTVDB">
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <rect width="24" height="24" rx="4" fill="#6cd491" />
        <path
          fill="#064"
          d="M6 7h12v2H6V7zm0 4h12v2H6v-2zm0 4h8v2H6v-2z"
        />
      </svg>
    </LinkIcon>
  );
}

export function JustWatchLinkIcon({ href }: { href: string }) {
  return (
    <LinkIcon href={href} label="JustWatch">
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <rect width="24" height="24" rx="4" fill="#000" />
        <path fill="#fbc500" d="M6 8h3v8H6V8zm5 0h3v8h-3V8zm5 0h3v8h-3V8z" />
      </svg>
    </LinkIcon>
  );
}
