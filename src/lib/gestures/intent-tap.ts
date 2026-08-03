export const INTENT_TAP_MOVE_THRESHOLD_PX = 10;

export type IntentGestureState = {
  active: boolean;
  moved: boolean;
  horizontalDrag: boolean;
  startX: number;
  startY: number;
};

/** True when the pointer is over the element's native scrollbar (not content). */
export function isScrollbarPointer(
  element: HTMLElement,
  clientX: number,
  clientY: number
): boolean {
  const rect = element.getBoundingClientRect();
  const x = clientX - rect.left - element.clientLeft;
  const y = clientY - rect.top - element.clientTop;
  return x < 0 || y < 0 || x >= element.clientWidth || y >= element.clientHeight;
}

export function createIntentGestureState(
  startX: number,
  startY: number
): IntentGestureState {
  return {
    active: true,
    moved: false,
    horizontalDrag: false,
    startX,
    startY,
  };
}

export function updateIntentGestureMovement(
  state: IntentGestureState,
  clientX: number,
  clientY: number
): void {
  if (!state.active) return;

  const deltaX = clientX - state.startX;
  const deltaY = clientY - state.startY;

  if (
    !state.moved &&
    (Math.abs(deltaX) > INTENT_TAP_MOVE_THRESHOLD_PX ||
      Math.abs(deltaY) > INTENT_TAP_MOVE_THRESHOLD_PX)
  ) {
    state.moved = true;
    state.horizontalDrag = Math.abs(deltaX) > Math.abs(deltaY);
  }
}
