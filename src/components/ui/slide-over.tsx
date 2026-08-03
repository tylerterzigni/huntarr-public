"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SlideOverProps {
  open: boolean;
  title: string;
  subText?: string;
  onClose: () => void;
  children: React.ReactNode;
}

const EXIT_MS = 280;

type SavedScrollStyles = {
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  bodyPaddingRight: string;
  htmlOverflow: string;
  htmlOverscroll: string;
};

/** Ref-counted so RSC remounts of DiscoverFilters don't unlock mid-open. */
let lockCount = 0;
let lockedScrollY = 0;
let savedStyles: SavedScrollStyles | null = null;
let usedFixedLock = false;

function isCoarsePointerMobile() {
  return window.matchMedia("(max-width: 767px)").matches;
}

function applyScrollLock() {
  if (lockCount > 0) {
    lockCount += 1;
    return;
  }

  const { body, documentElement } = document;
  lockedScrollY = window.scrollY;
  savedStyles = {
    bodyOverflow: body.style.overflow,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
    bodyPaddingRight: body.style.paddingRight,
    htmlOverflow: documentElement.style.overflow,
    htmlOverscroll: documentElement.style.overscrollBehavior,
  };

  // Mobile: overflow + touch blockers only. `position:fixed` + scroll restore
  // over a large discover poster grid repeatedly OOMs iOS WebKit on close.
  usedFixedLock = !isCoarsePointerMobile();

  body.style.overflow = "hidden";
  documentElement.style.overflow = "hidden";
  documentElement.style.overscrollBehavior = "none";
  documentElement.setAttribute("data-sheet-open", "true");

  if (usedFixedLock) {
    const scrollbarGap = window.innerWidth - documentElement.clientWidth;
    body.style.position = "fixed";
    body.style.top = `-${lockedScrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    if (scrollbarGap > 0) {
      body.style.paddingRight = `${scrollbarGap}px`;
    }
  }

  lockCount = 1;
}

function releaseScrollLock() {
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0) return;

  const { body, documentElement } = document;
  const previous = savedStyles;
  const scrollY = lockedScrollY;
  const wasFixed = usedFixedLock;
  savedStyles = null;
  usedFixedLock = false;

  if (previous) {
    body.style.overflow = previous.bodyOverflow;
    body.style.position = previous.bodyPosition;
    body.style.top = previous.bodyTop;
    body.style.left = previous.bodyLeft;
    body.style.right = previous.bodyRight;
    body.style.width = previous.bodyWidth;
    body.style.paddingRight = previous.bodyPaddingRight;
    documentElement.style.overflow = previous.htmlOverflow;
    documentElement.style.overscrollBehavior = previous.htmlOverscroll;
  }

  documentElement.removeAttribute("data-sheet-open");

  if (wasFixed) {
    // Defer scroll restore so style unlock and scroll aren't one compositor hit.
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
    });
  }
}

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    applyScrollLock();
    return () => releaseScrollLock();
  }, [locked]);
}

export function SlideOver({ open, title, subText, onClose, children }: SlideOverProps) {
  const [mounted, setMounted] = useState(false);
  /** Keep portal alive through the exit animation so close isn't an abrupt tear-down. */
  const [rendered, setRendered] = useState(open);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }

    if (open) {
      setRendered(true);
      const show = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(show);
    }

    setVisible(false);
    exitTimerRef.current = setTimeout(() => {
      setRendered(false);
      exitTimerRef.current = null;
    }, EXIT_MS);

    return () => {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [open]);

  // Hold the scroll lock for the whole open + exit window.
  useBodyScrollLock(rendered);

  useEffect(() => {
    if (!rendered) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [rendered, onClose]);

  // Block touch scroll chaining from the backdrop / chrome into the page behind.
  useEffect(() => {
    if (!rendered) return;

    function onTouchMove(event: TouchEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        event.preventDefault();
        return;
      }

      if (target.closest("[data-allow-touch-scroll]")) {
        return;
      }

      event.preventDefault();
    }

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => document.removeEventListener("touchmove", onTouchMove);
  }, [rendered]);

  if (!mounted || !rendered) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" data-no-pull-refresh>
      <button
        type="button"
        aria-label="Close filters"
        className={cn(
          // Solid dims on small screens — backdrop-filter over a poster wall OOMs WebKit.
          "absolute inset-0 bg-black/50 transition-opacity duration-300 md:bg-black/40 md:backdrop-blur-[2px]",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={cn(
          "relative flex h-full max-h-[100dvh] w-full max-w-lg flex-col border-l border-gray-300/70 bg-seerr-bg shadow-none transition-transform duration-300 ease-in-out sm:max-w-xl md:bg-white/40 md:backdrop-blur-xl",
          visible ? "translate-x-0" : "translate-x-full"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between border-b border-gray-300/70 px-6 pb-5 pt-safe">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            {subText && <p className="mt-1 text-sm text-muted-foreground">{subText}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-500 hover:bg-white/55 hover:text-gray-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4 pb-safe [-webkit-overflow-scrolling:touch]"
          data-allow-touch-scroll
          data-no-pull-refresh
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
