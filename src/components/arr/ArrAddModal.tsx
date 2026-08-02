"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import type { MediaType } from "@/types";

interface ArrAddModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
}

interface Instance {
  id: string;
  name: string;
  type: string;
}

export function ArrAddModal({ open, onOpenChange, tmdbId, mediaType, title }: ArrAddModalProps) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [profiles, setProfiles] = useState<Array<{ id: number; name: string }>>([]);
  const [folders, setFolders] = useState<Array<{ id: number; path: string }>>([]);
  const [instanceId, setInstanceId] = useState("");
  const [qualityProfileId, setQualityProfileId] = useState<number>();
  const [rootFolder, setRootFolder] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch(`/api/arr/instances?type=${mediaType === "movie" ? "radarr" : "sonarr"}`)
      .then((r) => r.json())
      .then((data) => {
        setInstances(data.instances ?? []);
        if (data.instances?.[0]) setInstanceId(data.instances[0].id);
      });
  }, [open, mediaType]);

  useEffect(() => {
    if (!instanceId) return;
    fetch(`/api/arr/profiles?instanceId=${instanceId}`)
      .then((r) => r.json())
      .then((data) => {
        setProfiles(data.profiles ?? []);
        setFolders(data.folders ?? []);
        if (data.profiles?.[0]) setQualityProfileId(data.profiles[0].id);
        if (data.folders?.[0]) setRootFolder(data.folders[0].path);
      });
  }, [instanceId]);

  async function handleAdd() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/arr/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId,
          tmdbId,
          mediaType,
          title,
          qualityProfileId,
          rootFolder,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-gray-300/70 bg-white/40 shadow-none backdrop-blur-md">
        <DialogHeader>
          <DialogTitle>Add {title} to {mediaType === "movie" ? "Radarr" : "Sonarr"}</DialogTitle>
        </DialogHeader>
        {success ? (
          <p className="text-emerald-400">Successfully added to your library manager!</p>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Instance</Label>
              <select
                className="mt-1 w-full rounded-md border border-gray-300/70 bg-white/40 p-2 text-sm text-gray-900 backdrop-blur-md focus-visible:border-gray-400 focus-visible:ring-gray-400"
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
              >
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Quality Profile</Label>
              <select
                className="mt-1 w-full rounded-md border border-gray-300/70 bg-white/40 p-2 text-sm text-gray-900 backdrop-blur-md focus-visible:border-gray-400 focus-visible:ring-gray-400"
                value={qualityProfileId}
                onChange={(e) => setQualityProfileId(Number(e.target.value))}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Root Folder</Label>
              <select
                className="mt-1 w-full rounded-md border border-gray-300/70 bg-white/40 p-2 text-sm text-gray-900 backdrop-blur-md focus-visible:border-gray-400 focus-visible:ring-gray-400"
                value={rootFolder}
                onChange={(e) => setRootFolder(e.target.value)}
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.path}>{f.path}</option>
                ))}
              </select>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <Button onClick={handleAdd} disabled={loading || !instanceId} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add to {mediaType === "movie" ? "Radarr" : "Sonarr"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
