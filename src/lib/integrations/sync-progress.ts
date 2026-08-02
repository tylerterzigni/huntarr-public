export type SyncProgressEvent = {
  phase: string;
  current: number;
  total: number;
  message: string;
};

export type SyncProgressCallback = (progress: SyncProgressEvent) => void;

export function reportSyncProgress(
  onProgress: SyncProgressCallback | undefined,
  progress: SyncProgressEvent
) {
  onProgress?.(progress);
}

/** Map a 0–1 fraction within a weighted phase onto overall 0–total units. */
export function phaseProgress(
  phaseStart: number,
  phaseEnd: number,
  fraction: number,
  total = 100
): { current: number; total: number } {
  const clamped = Math.min(1, Math.max(0, fraction));
  const current = Math.round(phaseStart + (phaseEnd - phaseStart) * clamped);
  return { current: Math.min(total, Math.max(0, current)), total };
}
