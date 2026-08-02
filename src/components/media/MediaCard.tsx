"use client";

import { useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { posterUrl, cn } from "@/lib/utils";
import { getMediaTitle, inferMediaType } from "@/lib/integrations/tmdb/helpers";
import { useIntentTap } from "@/hooks/useIntentTap";
import { HidePosterButton } from "./HidePosterButton";
import { PosterImage } from "./PosterImage";
import { useInScrollRow } from "./ScrollRowContext";
import type { RecommendationItem, TmdbMediaItem } from "@/types";

export const mediaCardLinkClassName =
  "block w-[160px] max-w-[160px] shrink-0 grow-0 basis-[160px] transition-transform hover:scale-105 hover:z-10";

export const mediaCardScrollRowClassName =
  "block w-[160px] max-w-[160px] shrink-0 grow-0 basis-[160px]";

export const mediaCardGridClassName = "block w-full min-w-0";

interface MediaCardProps {
  item: TmdbMediaItem | RecommendationItem;
  className?: string;
  showReason?: boolean;
  layout?: "default" | "grid";
  onHidden?: () => void;
}

interface PosterFrameProps {
  item: TmdbMediaItem | RecommendationItem;
  title: string;
  mediaType: ReturnType<typeof inferMediaType>;
  onHidden: () => void;
  href: string;
  navigateOnClick: boolean;
  posterClassName?: string;
}

function PosterFrame({
  item,
  title,
  mediaType,
  onHidden,
  href,
  navigateOnClick,
  posterClassName = "w-[160px]",
}: PosterFrameProps) {
  const router = useRouter();
  const [posterHovered, setPosterHovered] = useState(false);
  const [hideDialogOpen, setHideDialogOpen] = useState(false);
  const blockPosterNavUntilRef = useRef(0);
  const rec = item as RecommendationItem;

  function blockPosterNavigation() {
    blockPosterNavUntilRef.current = Date.now() + 1500;
  }

  function navigateToDetail() {
    if (hideDialogOpen) return;
    if (Date.now() < blockPosterNavUntilRef.current) return;
    if (!navigateOnClick) return;
    router.push(href);
  }

  const { onTouchStart, onPointerDown: onIntentPointerDown, onClick: onIntentClick } =
    useIntentTap(navigateToDetail, navigateOnClick);

  function handlePosterPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-media-action]")) return;
    onIntentPointerDown(event);
  }

  function handlePosterTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-media-action]")) return;
    onTouchStart(event);
  }

  function handlePosterClick(event: ReactMouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-media-action]")) return;
    onIntentClick(event);
  }

  return (
    <div
      className={cn(
        "media-poster-frame group/poster relative aspect-[2/3] overflow-hidden rounded-lg bg-seerr-card shadow-lg",
        posterClassName,
        navigateOnClick && "cursor-pointer"
      )}
      onMouseEnter={() => setPosterHovered(true)}
      onMouseLeave={() => setPosterHovered(false)}
      onTouchStart={navigateOnClick ? handlePosterTouchStart : undefined}
      onPointerDown={navigateOnClick ? handlePosterPointerDown : undefined}
      onClick={navigateOnClick ? handlePosterClick : undefined}
      onKeyDown={(event) => {
        if (!navigateOnClick) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(href);
        }
      }}
      role={navigateOnClick ? "link" : undefined}
      tabIndex={navigateOnClick ? 0 : undefined}
      aria-label={navigateOnClick ? title : undefined}
      data-nav-href={navigateOnClick ? undefined : href}
    >
      <PosterImage src={posterUrl(item.poster_path, "w342")} alt={title} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity group-hover/poster:opacity-100" />
      {rec.inLibrary ? (
        <span className="pointer-events-none absolute top-2 left-2 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
          In Library
        </span>
      ) : (
        <span
          className={cn(
            "pointer-events-none absolute top-2 left-2 rounded px-1.5 py-0.5 text-[10px] font-medium text-white",
            mediaType === "movie" ? "bg-indigo-600/90" : "bg-sky-600/90"
          )}
        >
          {mediaType === "movie" ? "Movie" : "Series"}
        </span>
      )}
      {rec.watched && (
        <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-blue-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
          Watched
        </span>
      )}
      <HidePosterButton
        tmdbId={item.id}
        mediaType={mediaType}
        title={title}
        visible={posterHovered}
        onHidden={onHidden}
        onDialogClose={blockPosterNavigation}
        onDialogOpenChange={setHideDialogOpen}
      />
    </div>
  );
}

function MediaCardContent({
  item,
  showReason,
  onHidden,
  href,
}: Pick<MediaCardProps, "item" | "showReason" | "onHidden"> & { href: string }) {
  const title = getMediaTitle(item);
  const mediaType = inferMediaType(item);
  const rec = item as RecommendationItem;

  return (
    <>
      <PosterFrame
        item={item}
        title={title}
        mediaType={mediaType}
        onHidden={onHidden ?? (() => {})}
        href={href}
        navigateOnClick={false}
      />
      <p className="mt-2 text-sm font-medium line-clamp-2 text-foreground/90">{title}</p>
      {showReason && rec.reason && (
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{rec.reason}</p>
      )}
    </>
  );
}

export function MediaCard({
  item,
  className,
  showReason = true,
  layout = "default",
  onHidden,
}: MediaCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const mediaType = inferMediaType(item);
  const title = getMediaTitle(item);
  const href = mediaType === "movie" ? `/movie/${item.id}` : `/tv/${item.id}`;
  const rec = item as RecommendationItem;
  const inScrollRow = useInScrollRow();

  function handleHidden() {
    setDismissed(true);
    onHidden?.();
  }

  if (dismissed) return null;

  if (inScrollRow) {
    return (
      <div
        className={cn("group/card relative", mediaCardScrollRowClassName, "scroll-row-item", className)}
      >
        <MediaCardContent item={item} showReason={showReason} onHidden={handleHidden} href={href} />
      </div>
    );
  }

  if (layout === "grid") {
    return (
      <div className={cn("group/card relative", mediaCardGridClassName, className)}>
        <PosterFrame
          item={item}
          title={title}
          mediaType={mediaType}
          onHidden={handleHidden}
          href={href}
          navigateOnClick
          posterClassName="w-full"
        />
        <Link href={href} draggable={false} className="mt-1.5 block">
          <p className="text-xs font-medium line-clamp-2 text-foreground/90">{title}</p>
          {showReason && rec.reason && (
            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{rec.reason}</p>
          )}
        </Link>
      </div>
    );
  }

  return (
    <div className={cn("group/card relative", mediaCardLinkClassName, className)}>
      <PosterFrame
        item={item}
        title={title}
        mediaType={mediaType}
        onHidden={handleHidden}
        href={href}
        navigateOnClick
      />
      <Link href={href} draggable={false} className="mt-2 block">
        <p className="text-sm font-medium line-clamp-2 text-foreground/90">{title}</p>
        {showReason && rec.reason && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{rec.reason}</p>
        )}
      </Link>
    </div>
  );
}
