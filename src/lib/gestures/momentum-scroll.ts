export type VelocityTracker = {
  samples: Array<{ x: number; time: number }>;
};

const SAMPLE_WINDOW_MS = 100;
const MAX_SAMPLES = 8;
const MIN_VELOCITY_PX_PER_MS = 0.04;
const MIN_VELOCITY_STOP_PX_PER_MS = 0.02;
const FRAME_DECAY = 0.965;

export function createVelocityTracker(): VelocityTracker {
  return { samples: [] };
}

export function resetVelocityTracker(tracker: VelocityTracker): void {
  tracker.samples.length = 0;
}

export function recordVelocitySample(tracker: VelocityTracker, x: number, time: number): void {
  tracker.samples.push({ x, time });

  const cutoff = time - SAMPLE_WINDOW_MS;
  while (tracker.samples.length > 1 && tracker.samples[0].time < cutoff) {
    tracker.samples.shift();
  }

  while (tracker.samples.length > MAX_SAMPLES) {
    tracker.samples.shift();
  }
}

export function getReleaseVelocityPxPerMs(tracker: VelocityTracker): number {
  const { samples } = tracker;
  if (samples.length < 2) return 0;

  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = last.time - first.time;
  if (dt < 8) return 0;

  return (last.x - first.x) / dt;
}

export function applyHorizontalMomentumScroll(
  element: HTMLElement,
  velocityPxPerMs: number,
  options?: {
    onComplete?: () => void;
  }
): () => void {
  if (Math.abs(velocityPxPerMs) < MIN_VELOCITY_PX_PER_MS) {
    options?.onComplete?.();
    return () => {};
  }

  // Finger moving right (+velocity) decreases scrollLeft.
  let velocity = -velocityPxPerMs;
  let cancelled = false;
  let rafId = 0;
  let lastTime = performance.now();

  function tick(now: number) {
    if (cancelled) return;

    const dt = Math.min(now - lastTime, 32);
    lastTime = now;

    const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth);
    element.scrollLeft += velocity * dt;

    if (element.scrollLeft <= 0) {
      element.scrollLeft = 0;
      options?.onComplete?.();
      return;
    }
    if (element.scrollLeft >= maxScroll) {
      element.scrollLeft = maxScroll;
      options?.onComplete?.();
      return;
    }

    velocity *= Math.pow(FRAME_DECAY, dt / 16);

    if (Math.abs(velocity) < MIN_VELOCITY_STOP_PX_PER_MS) {
      options?.onComplete?.();
      return;
    }

    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
  };
}
