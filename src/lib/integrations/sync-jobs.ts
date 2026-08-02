import { syncPlexLibrary, syncTautulliHistory } from "@/lib/integrations/sync";
import type { SyncProgressEvent } from "@/lib/integrations/sync-progress";
import type {
  SyncJobSnapshot,
  SyncService,
} from "@/lib/integrations/sync-job-types";
import { buildTasteProfile, clearForYouRecommendationCache } from "@/lib/recommendations/engine";

export type { SyncJobResult, SyncJobSnapshot, SyncService } from "@/lib/integrations/sync-job-types";

type StartOptions = {
  service: SyncService;
  userId: string;
  usernames: string[];
  /** Rebuild taste profile after a successful Tautulli sync (Settings / daily). */
  rebuildTasteProfile?: boolean;
};

const jobs = new Map<string, SyncJobSnapshot>();
const activeByService = new Map<SyncService, string>();

const JOB_RETENTION_MS = 30 * 60 * 1000;

function pruneOldJobs() {
  const cutoff = Date.now() - JOB_RETENTION_MS;
  for (const [id, job] of jobs) {
    if (job.status === "running") continue;
    const ended = job.finishedAt ?? job.startedAt;
    if (ended < cutoff) jobs.delete(id);
  }
}

function snapshot(job: SyncJobSnapshot): SyncJobSnapshot {
  return {
    ...job,
    progress: { ...job.progress },
    result: job.result ? { ...job.result } : undefined,
  };
}

export function getSyncJob(id: string): SyncJobSnapshot | null {
  const job = jobs.get(id);
  return job ? snapshot(job) : null;
}

export function getActiveSyncJob(service: SyncService): SyncJobSnapshot | null {
  const id = activeByService.get(service);
  if (!id) return null;
  const job = jobs.get(id);
  if (!job || job.status !== "running") return null;
  return snapshot(job);
}

/** Active jobs plus recently finished ones (for Settings UI). */
export function listSyncJobs(): SyncJobSnapshot[] {
  pruneOldJobs();
  return [...jobs.values()]
    .map(snapshot)
    .sort((a, b) => b.startedAt - a.startedAt);
}

export async function waitForSyncJob(
  id: string,
  timeoutMs = 30 * 60 * 1000
): Promise<SyncJobSnapshot> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = jobs.get(id);
    if (!job) throw new Error("Sync job not found");
    if (job.status !== "running") return snapshot(job);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Sync timed out");
}

/**
 * Start a sync that keeps running even if the HTTP client disconnects.
 * If the same service is already running, returns the existing job.
 */
export function startSyncJob(options: StartOptions): {
  job: SyncJobSnapshot;
  started: boolean;
} {
  pruneOldJobs();

  const existingId = activeByService.get(options.service);
  if (existingId) {
    const existing = jobs.get(existingId);
    if (existing?.status === "running") {
      return { job: snapshot(existing), started: false };
    }
  }

  const id = crypto.randomUUID();
  const job: SyncJobSnapshot = {
    id,
    service: options.service,
    status: "running",
    progress: {
      phase: "start",
      current: 0,
      total: 100,
      message:
        options.service === "plex"
          ? "Starting Plex library sync…"
          : "Starting watch history sync…",
    },
    startedAt: Date.now(),
    userId: options.userId,
  };

  jobs.set(id, job);
  activeByService.set(options.service, id);

  void runSyncJob(job, options).finally(() => {
    if (activeByService.get(options.service) === id) {
      activeByService.delete(options.service);
    }
  });

  return { job: snapshot(job), started: true };
}

async function runSyncJob(job: SyncJobSnapshot, options: StartOptions) {
  const onProgress = (progress: SyncProgressEvent) => {
    job.progress = progress;
  };

  try {
    if (options.service === "plex") {
      job.result = await syncPlexLibrary(options.usernames, onProgress);
    } else {
      job.result = await syncTautulliHistory(options.usernames, onProgress);
      if (options.rebuildTasteProfile !== false) {
        await buildTasteProfile(options.userId);
        clearForYouRecommendationCache(options.userId);
      }
    }
    job.status = "done";
    job.finishedAt = Date.now();
    job.progress = {
      phase: "done",
      current: 100,
      total: 100,
      message: job.progress.message || "Sync complete",
    };
  } catch (err) {
    job.status = "error";
    job.error = err instanceof Error ? err.message : "Sync failed";
    job.finishedAt = Date.now();
    job.progress = {
      phase: "error",
      current: job.progress.current,
      total: job.progress.total,
      message: job.error,
    };
  }
}
