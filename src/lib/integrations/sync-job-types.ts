import type { SyncProgressEvent } from "@/lib/integrations/sync-progress";

export type SyncService = "plex" | "tautulli";

export type SyncJobResult = {
  synced: number;
  watchedSynced?: number;
  fetched?: number;
  movies?: number;
  tv?: number;
};

export type SyncJobSnapshot = {
  id: string;
  service: SyncService;
  status: "running" | "done" | "error";
  progress: SyncProgressEvent;
  result?: SyncJobResult;
  error?: string;
  startedAt: number;
  finishedAt?: number;
  userId: string;
};
