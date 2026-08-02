"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  createIntentGestureState,
  updateIntentGestureMovement,
  type IntentGestureState,
} from "@/lib/gestures/intent-tap";
import {
  applyHorizontalMomentumScroll,
  createVelocityTracker,
  getReleaseVelocityPxPerMs,
  recordVelocitySample,
  resetVelocityTracker,
  type VelocityTracker,
} from "@/lib/gestures/momentum-scroll";
import { InScrollRowContext } from "./ScrollRowContext";

interface HorizontalScrollRowProps {
  children: ReactNode;
  className?: string;
}

const NAV_HREF_ATTR = "data-nav-href";
const MEDIA_ACTION_SELECTOR = "[data-media-action]";

type ScrollGestureState = IntentGestureState & {
  startScrollLeft: number;
  inputType: "touch" | "mouse" | null;
};

function isMediaActionTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest(MEDIA_ACTION_SELECTOR));
}

function findNavTargetFromEvent(
  scrollElement: HTMLElement,
  target: EventTarget | null
): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  const navTarget = target.closest(`[${NAV_HREF_ATTR}]`);
  if (!(navTarget instanceof HTMLElement) || !scrollElement.contains(navTarget)) return null;
  return navTarget;
}

export function HorizontalScrollRow({ children, className }: HorizontalScrollRowProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<ScrollGestureState>({
    active: false,
    moved: false,
    horizontalDrag: false,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    inputType: null,
  });
  const suppressClickRef = useRef(false);
  const touchTrackingCleanupRef = useRef<(() => void) | null>(null);
  const velocityTrackerRef = useRef<VelocityTracker>(createVelocityTracker());
  const cancelMomentumRef = useRef<(() => void) | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const cancelMomentum = useCallback(() => {
    cancelMomentumRef.current?.();
    cancelMomentumRef.current = null;
  }, []);

  const resetGesture = useCallback(() => {
    gestureRef.current.active = false;
    gestureRef.current.moved = false;
    gestureRef.current.horizontalDrag = false;
    gestureRef.current.inputType = null;
    setIsDragging(false);
  }, []);

  const stopTouchTracking = useCallback(() => {
    touchTrackingCleanupRef.current?.();
    touchTrackingCleanupRef.current = null;
  }, []);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    function handleDocumentDragStart(event: DragEvent) {
      if (!gestureRef.current.active) return;
      event.preventDefault();
    }

    function beginGesture(
      clientX: number,
      clientY: number,
      inputType: ScrollGestureState["inputType"]
    ) {
      cancelMomentum();
      resetVelocityTracker(velocityTrackerRef.current);
      gestureRef.current = {
        ...createIntentGestureState(clientX, clientY),
        startScrollLeft: scrollEl!.scrollLeft,
        inputType,
      };
    }

    function updateGesture(clientX: number, clientY: number, event?: Event) {
      const el = scrollEl;
      const state = gestureRef.current;
      if (!state.active || !el) return;

      updateIntentGestureMovement(state, clientX, clientY);

      if (state.horizontalDrag) {
        event?.preventDefault();
        setIsDragging(true);
        recordVelocitySample(velocityTrackerRef.current, clientX, performance.now());
        el.scrollLeft = state.startScrollLeft - (clientX - state.startX);
      }
    }

    function tryNavigate(clientX: number, clientY: number) {
      if (!scrollEl) return false;
      if (isMediaActionTarget(document.elementFromPoint(clientX, clientY))) return false;

      const navTarget = findNavTargetFromEvent(
        scrollEl,
        document.elementFromPoint(clientX, clientY)
      );
      if (!navTarget) return false;

      const href = navTarget.getAttribute(NAV_HREF_ATTR);
      if (!href) return false;

      suppressClickRef.current = true;
      router.push(href);
      return true;
    }

    function endGesture(clientX?: number, clientY?: number) {
      const state = gestureRef.current;
      if (!state.active) return;

      const shouldApplyMomentum =
        state.inputType === "touch" && state.horizontalDrag && state.moved;
      const releaseVelocity = shouldApplyMomentum
        ? getReleaseVelocityPxPerMs(velocityTrackerRef.current)
        : 0;

      if (state.moved) {
        suppressClickRef.current = true;
      } else if (clientX != null && clientY != null) {
        tryNavigate(clientX, clientY);
      }

      stopTouchTracking();

      state.active = false;
      state.moved = false;
      state.horizontalDrag = false;
      state.inputType = null;
      resetVelocityTracker(velocityTrackerRef.current);

      if (shouldApplyMomentum && scrollEl) {
        cancelMomentumRef.current = applyHorizontalMomentumScroll(scrollEl, releaseVelocity, {
          onComplete: () => {
            cancelMomentumRef.current = null;
            setIsDragging(false);
          },
        });
        return;
      }

      setIsDragging(false);
    }

    function handleMouseDown(event: MouseEvent) {
      if (event.button !== 0) return;

      const hitTarget = document.elementFromPoint(event.clientX, event.clientY);
      if (isMediaActionTarget(event.target) || isMediaActionTarget(hitTarget)) {
        resetGesture();
        return;
      }

      beginGesture(event.clientX, event.clientY, "mouse");
    }

    function handleMouseMove(event: MouseEvent) {
      updateGesture(event.clientX, event.clientY, event);
    }

    function handleMouseUp(event: MouseEvent) {
      endGesture(event.clientX, event.clientY);
    }

    function handleClick(event: MouseEvent) {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }

      if (!scrollEl) return;
      if (isMediaActionTarget(event.target)) return;

      const hitTarget = document.elementFromPoint(event.clientX, event.clientY);
      if (isMediaActionTarget(hitTarget)) return;

      tryNavigate(event.clientX, event.clientY);
    }

    function handleTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch) return;

      const hitTarget = document.elementFromPoint(touch.clientX, touch.clientY);
      if (isMediaActionTarget(event.target) || isMediaActionTarget(hitTarget)) {
        resetGesture();
        return;
      }

      beginGesture(touch.clientX, touch.clientY, "touch");
      stopTouchTracking();

      function onDocumentTouchMove(moveEvent: TouchEvent) {
        const activeTouch = moveEvent.touches[0];
        if (!activeTouch) return;
        updateGesture(activeTouch.clientX, activeTouch.clientY, moveEvent);
      }

      function onDocumentTouchEnd(endEvent: TouchEvent) {
        const touch = endEvent.changedTouches[0];
        endGesture(touch?.clientX, touch?.clientY);
      }

      document.addEventListener("touchmove", onDocumentTouchMove, { passive: false });
      document.addEventListener("touchend", onDocumentTouchEnd, { passive: true });
      document.addEventListener("touchcancel", onDocumentTouchEnd, { passive: true });

      touchTrackingCleanupRef.current = () => {
        document.removeEventListener("touchmove", onDocumentTouchMove);
        document.removeEventListener("touchend", onDocumentTouchEnd);
        document.removeEventListener("touchcancel", onDocumentTouchEnd);
      };
    }

    document.addEventListener("dragstart", handleDocumentDragStart, true);
    scrollEl.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove, { passive: false });
    document.addEventListener("mouseup", handleMouseUp);
    scrollEl.addEventListener("click", handleClick);
    scrollEl.addEventListener("touchstart", handleTouchStart, { passive: true });

    return () => {
      document.removeEventListener("dragstart", handleDocumentDragStart, true);
      scrollEl.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      scrollEl.removeEventListener("click", handleClick);
      scrollEl.removeEventListener("touchstart", handleTouchStart);
      stopTouchTracking();
      cancelMomentum();
    };
  }, [cancelMomentum, resetGesture, router, stopTouchTracking]);

  return (
    <InScrollRowContext.Provider value={true}>
      <div className={cn("horizontal-scroll-row-wrapper relative", className)}>
        <div
          ref={scrollRef}
          data-dragging={isDragging || undefined}
          className="horizontal-scroll-row flex cursor-grab gap-4 overflow-x-auto overscroll-x-contain scrollbar-thin data-[dragging]:cursor-grabbing"
        >
          {children}
        </div>
      </div>
    </InScrollRowContext.Provider>
  );
}
