"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  createIntentGestureState,
  updateIntentGestureMovement,
  type IntentGestureState,
} from "@/lib/gestures/intent-tap";

export function useIntentTap(onTap: () => void, enabled = true) {
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  const gestureRef = useRef<IntentGestureState | null>(null);
  const moveTrackingCleanupRef = useRef<(() => void) | null>(null);

  const stopMoveTracking = useCallback(() => {
    moveTrackingCleanupRef.current?.();
    moveTrackingCleanupRef.current = null;
  }, []);

  useEffect(() => () => stopMoveTracking(), [stopMoveTracking]);

  const startTracking = useCallback(
    (clientX: number, clientY: number) => {
      stopMoveTracking();
      gestureRef.current = createIntentGestureState(clientX, clientY);

      function noteMovement(clientX: number, clientY: number) {
        if (!gestureRef.current) return;
        updateIntentGestureMovement(gestureRef.current, clientX, clientY);
      }

      function onTouchMove(event: TouchEvent) {
        const touch = event.touches[0];
        if (touch) noteMovement(touch.clientX, touch.clientY);
      }

      function onPointerMove(event: PointerEvent) {
        noteMovement(event.clientX, event.clientY);
      }

      document.addEventListener("touchmove", onTouchMove, { passive: true });
      document.addEventListener("pointermove", onPointerMove, { passive: true });

      moveTrackingCleanupRef.current = () => {
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("pointermove", onPointerMove);
      };
    },
    [stopMoveTracking]
  );

  const onTouchStart = useCallback(
    (event: React.TouchEvent<HTMLElement>) => {
      if (!enabled) return;
      const touch = event.touches[0];
      if (!touch) return;
      startTracking(touch.clientX, touch.clientY);
    },
    [enabled, startTracking]
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!enabled || event.pointerType === "touch" || event.button !== 0) return;
      startTracking(event.clientX, event.clientY);
    },
    [enabled, startTracking]
  );

  const onClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!enabled) return;

      stopMoveTracking();

      const gesture = gestureRef.current;
      gestureRef.current = null;

      // Ignore clicks with no matching press (e.g. scrollbar release ghost clicks).
      if (!gesture) return;

      if (gesture.moved) {
        event.preventDefault();
        return;
      }

      onTapRef.current();
    },
    [enabled, stopMoveTracking]
  );

  return { onTouchStart, onPointerDown, onClick };
}
