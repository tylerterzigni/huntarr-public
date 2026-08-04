"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, KeyRound, Loader2, Trash2, RefreshCw, Pencil } from "lucide-react";
import { ChangePasswordDialog } from "@/components/auth/ChangePasswordDialog";
import { RecommendationsSettings } from "@/components/settings/RecommendationsSettings";
import { HomePageSettings } from "@/components/settings/HomePageSettings";
import { SyncProgressBar } from "@/components/settings/SyncProgressBar";
import { ListItemSearch } from "@/components/settings/ListItemSearch";
import { AiModelInput } from "@/components/settings/AiModelInput";
import { rememberModel } from "@/lib/ai/model-history";
import type { SyncJobSnapshot } from "@/lib/integrations/sync-job-types";
import type { HomeRowId } from "@/lib/home/row-order";

const LIST_PAGE_SIZE = 20;

const settingsTabTriggerClassName =
  "rounded-md border border-gray-300/70 bg-white/35 px-3.5 py-2 text-sm shadow-sm backdrop-blur-md data-[state=active]:border-gray-500 data-[state=active]:bg-white/70 data-[state=active]:font-semibold data-[state=active]:text-gray-900";

function sortByTitle<T extends { title: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
  );
}

function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function totalPages(count: number, pageSize: number): number {
  return Math.max(1, Math.ceil(count / pageSize));
}

interface SettingsData {
  general: { tmdbConfigured: boolean; omdbConfigured: boolean; region: string; language: string };
  integrations: Array<{
    id: string;
    type: string;
    name: string;
    baseUrl: string;
    isDefault: boolean;
    enabled: boolean;
    config: Record<string, unknown>;
    hasCredentials: boolean;
  }>;
  aiProviders: Array<{
    id: string;
    provider: string;
    name: string;
    model: string;
    priority: number;
    enabled: boolean;
    baseUrl?: string;
    hasApiKey: boolean;
  }>;
  preferences: {
    tautulliUsernames: string[];
    recommendationWeights: Record<string, number>;
    recommendationKeywords: string[];
    homeRowOrder?: string[];
  } | null;
  userRole: string;
}

interface HideItem {
  id: string;
  tmdbId: number;
  mediaType: string;
  title: string;
  scope: string;
  reason?: string;
}

interface LikedItem {
  id: string;
  tmdbId: number;
  kind: string;
  title: string;
}

export function SettingsClient() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [hideItems, setHideItems] = useState<HideItem[]>([]);
  const [likedItems, setLikedItems] = useState<LikedItem[]>([]);
  const [hidePage, setHidePage] = useState(1);
  const [likedPage, setLikedPage] = useState(1);
  const [highlightedHideId, setHighlightedHideId] = useState<string | null>(null);
  const [highlightedLikedId, setHighlightedLikedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [testing, setTesting] = useState<string | null>(null);
  const [syncJobs, setSyncJobs] = useState<SyncJobSnapshot[]>([]);
  const announcedSyncJobs = useRef(new Set<string>());
  const syncStatusHydrated = useRef(false);
  const [aiTestConfirm, setAiTestConfirm] = useState<{ id: string; name: string } | null>(null);
  const [aiChange, setAiChange] = useState<{
    id: string;
    name: string;
    provider: string;
    model: string;
    priority: number;
    enabled: boolean;
    baseUrl?: string;
  } | null>(null);
  const [aiChangeModel, setAiChangeModel] = useState("");
  const [aiChangePriority, setAiChangePriority] = useState("");
  const [aiChangeSaving, setAiChangeSaving] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const load = useCallback(async () => {
    const [settingsRes, hideRes, likedRes] = await Promise.all([
      fetch("/api/settings"),
      fetch("/api/hide-list"),
      fetch("/api/liked-list"),
    ]);
    setData(await settingsRes.json());
    const hideData = await hideRes.json();
    setHideItems(hideData.items ?? []);
    const likedData = await likedRes.json();
    setLikedItems(likedData.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const formatSyncResultMessage = useCallback((job: SyncJobSnapshot) => {
    if (job.status === "error") {
      return job.error || "Sync failed";
    }
    const result = job.result;
    if (!result) return "Sync complete";

    if (job.service === "tautulli" && result.fetched != null) {
      const breakdown =
        result.movies != null && result.tv != null
          ? ` (${result.movies} movies, ${result.tv} TV shows)`
          : "";
      return (
        `Synced ${result.synced ?? 0} titles from ${result.fetched} history entries${breakdown}` +
        (result.synced === 0 && result.fetched > 0
          ? " — entries could not be mapped to TMDB (check TMDB API key in General settings)"
          : "")
      );
    }

    if (job.service === "plex") {
      const watched =
        result.watchedSynced != null && result.watchedSynced > 0
          ? ` (${result.watchedSynced} watched titles for Because You Watched)`
          : "";
      return `Synced ${result.synced ?? 0} library items${watched}`;
    }

    return `Synced ${result.synced ?? 0} items`;
  }, []);

  const refreshSyncJobs = useCallback(async () => {
    const res = await fetch("/api/sync/status", { cache: "no-store" });
    if (!res.ok) return [] as SyncJobSnapshot[];
    const data = await res.json();
    const jobs = (data.jobs ?? []) as SyncJobSnapshot[];
    setSyncJobs(jobs);

    // First poll after mount/reload: adopt existing finished jobs silently.
    if (!syncStatusHydrated.current) {
      syncStatusHydrated.current = true;
      for (const job of jobs) {
        if (job.status !== "running") {
          announcedSyncJobs.current.add(job.id);
        }
      }
      return jobs;
    }

    for (const job of jobs) {
      if (job.status === "running") continue;
      if (announcedSyncJobs.current.has(job.id)) continue;
      announcedSyncJobs.current.add(job.id);
      setMessage(formatSyncResultMessage(job));
    }

    return jobs;
  }, [formatSyncResultMessage]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const jobs = await refreshSyncJobs();
        if (cancelled) return;
        const running = jobs.some((job) => job.status === "running");
        timer = setTimeout(poll, running ? 400 : 3000);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 3000);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refreshSyncJobs]);

  const plexSyncJob = useMemo(
    () => syncJobs.find((job) => job.service === "plex" && job.status === "running") ?? null,
    [syncJobs]
  );
  const tautulliSyncJob = useMemo(
    () =>
      syncJobs.find((job) => job.service === "tautulli" && job.status === "running") ?? null,
    [syncJobs]
  );
  const syncBusy = Boolean(plexSyncJob || tautulliSyncJob);

  async function saveGeneral(form: FormData) {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: "general",
        data: {
          tmdbApiKey: form.get("tmdbApiKey") || undefined,
          omdbApiKey: form.get("omdbApiKey") || undefined,
          region: form.get("region"),
          language: form.get("language"),
        },
      }),
    });
    setMessage("General settings saved");
    load();
  }

  async function saveIntegration(type: string, form: FormData, id?: string) {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: "integration",
        data: {
          id,
          type,
          name: form.get("name"),
          baseUrl: form.get("baseUrl"),
          apiKey: form.get("apiKey") || undefined,
          token: form.get("token") || undefined,
          isDefault: form.get("isDefault") === "on",
          enabled: form.get("enabled") !== "off",
          config: {
            defaultQualityProfileId: Number(form.get("qualityProfileId")) || undefined,
            defaultRootFolder: form.get("rootFolder") || undefined,
          },
        },
      }),
    });
    setMessage(`${type} instance saved`);
    load();
  }

  async function saveAI(form: FormData, id?: string) {
    const model = String(form.get("model") ?? "").trim();
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: "ai",
        data: {
          id,
          provider: form.get("provider"),
          name: form.get("name"),
          apiKey: form.get("apiKey") || undefined,
          baseUrl: form.get("baseUrl") || undefined,
          model,
          priority: Number(form.get("priority")) || 0,
          enabled: form.get("enabled") !== "off",
        },
      }),
    });
    rememberModel(model);
    setMessage("AI provider saved");
    load();
  }

  function openAIChange(p: SettingsData["aiProviders"][number]) {
    setAiChange({
      id: p.id,
      name: p.name,
      provider: p.provider,
      model: p.model,
      priority: p.priority,
      enabled: p.enabled,
      baseUrl: p.baseUrl,
    });
    setAiChangeModel("");
    setAiChangePriority("");
  }

  async function confirmAIChange() {
    if (!aiChange) return;

    const nextModel = aiChangeModel.trim() || aiChange.model;
    const priorityInput = aiChangePriority.trim();
    const nextPriority =
      priorityInput === ""
        ? aiChange.priority
        : Number(priorityInput);

    if (priorityInput !== "" && !Number.isFinite(nextPriority)) {
      setMessage("Priority must be a number");
      return;
    }

    setAiChangeSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "ai",
          data: {
            id: aiChange.id,
            provider: aiChange.provider,
            name: aiChange.name,
            model: nextModel,
            priority: nextPriority,
            enabled: aiChange.enabled,
            baseUrl: aiChange.baseUrl || undefined,
          },
        }),
      });
      rememberModel(nextModel);
      setAiChange(null);
      setMessage("AI provider updated");
      await load();
    } finally {
      setAiChangeSaving(false);
    }
  }

  async function saveRecommendations(keywords: string[]) {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: "recommendations",
        data: { keywords },
      }),
    });
    setMessage("Recommendation keywords saved");
    load();
  }

  async function saveHomePageOrder(homeRowOrder: HomeRowId[]) {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: "home-page",
        data: { homeRowOrder },
      }),
    });
    setMessage("Home page row order saved");
    load();
  }

  async function savePreferences(form: FormData) {
    const usernames = (form.get("tautulliUsernames") as string)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: "preferences",
        data: { tautulliUsernames: usernames },
      }),
    });
    setMessage("Tautulli users saved");
    load();
  }

  async function testConnection(service: string, id?: string) {
    setTesting(service + (id ?? ""));
    const url = id
      ? `/api/settings/test/${service}?id=${id}`
      : `/api/settings/test/${service}`;
    const res = await fetch(url);
    const result = await res.json();
    setMessage(result.success ? result.message : result.error);
    setTesting(null);
  }

  async function confirmAITest() {
    if (!aiTestConfirm) return;
    const { id } = aiTestConfirm;
    setAiTestConfirm(null);
    await testConnection("ai", id);
  }

  async function syncService(service: "plex" | "tautulli") {
    setTesting("sync-" + service);
    setMessage("");

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Sync failed");
        return;
      }
      if (data.job?.id) {
        // Avoid double-toasting when the poller later sees completion.
        // (Still announce when the job finishes.)
      }
      await refreshSyncJobs();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setTesting(null);
    }
  }

  async function deleteIntegration(id: string) {
    await fetch(`/api/settings?type=integration&id=${id}`, { method: "DELETE" });
    load();
  }

  async function deleteAI(id: string) {
    await fetch(`/api/settings?type=ai&id=${id}`, { method: "DELETE" });
    setMessage("AI provider deleted");
    load();
  }

  async function removeHideItem(id: string) {
    await fetch(`/api/hide-list?id=${id}`, { method: "DELETE" });
    load();
  }

  async function removeLikedItem(id: string) {
    await fetch(`/api/liked-list?id=${id}`, { method: "DELETE" });
    load();
  }

  const sortedHideItems = useMemo(() => sortByTitle(hideItems), [hideItems]);
  const sortedLikedItems = useMemo(() => sortByTitle(likedItems), [likedItems]);
  const hideTotalPages = totalPages(sortedHideItems.length, LIST_PAGE_SIZE);
  const likedTotalPages = totalPages(sortedLikedItems.length, LIST_PAGE_SIZE);
  const safeHidePage = Math.min(hidePage, hideTotalPages);
  const safeLikedPage = Math.min(likedPage, likedTotalPages);
  const pagedHideItems = paginate(sortedHideItems, safeHidePage, LIST_PAGE_SIZE);
  const pagedLikedItems = paginate(sortedLikedItems, safeLikedPage, LIST_PAGE_SIZE);

  const hideSearchItems = useMemo(
    () =>
      sortedHideItems.map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: `${item.mediaType} · ${item.scope}`,
      })),
    [sortedHideItems]
  );
  const likedSearchItems = useMemo(
    () =>
      sortedLikedItems.map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.kind,
      })),
    [sortedLikedItems]
  );

  const knownAiModels = useMemo(
    () => (data?.aiProviders ?? []).map((provider) => provider.model),
    [data?.aiProviders]
  );

  useEffect(() => {
    if (!highlightedHideId) return;
    const timer = window.setTimeout(() => setHighlightedHideId(null), 2500);
    return () => window.clearTimeout(timer);
  }, [highlightedHideId]);

  useEffect(() => {
    if (!highlightedLikedId) return;
    const timer = window.setTimeout(() => setHighlightedLikedId(null), 2500);
    return () => window.clearTimeout(timer);
  }, [highlightedLikedId]);

  useEffect(() => {
    if (!highlightedHideId) return;
    if (!pagedHideItems.some((item) => item.id === highlightedHideId)) return;
    document.getElementById(`hide-item-${highlightedHideId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [highlightedHideId, pagedHideItems]);

  useEffect(() => {
    if (!highlightedLikedId) return;
    if (!pagedLikedItems.some((item) => item.id === highlightedLikedId)) return;
    document.getElementById(`liked-item-${highlightedLikedId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [highlightedLikedId, pagedLikedItems]);

  function jumpToHideItem(id: string) {
    const index = sortedHideItems.findIndex((item) => item.id === id);
    if (index < 0) return;
    setHidePage(Math.floor(index / LIST_PAGE_SIZE) + 1);
    setHighlightedHideId(id);
  }

  function jumpToLikedItem(id: string) {
    const index = sortedLikedItems.findIndex((item) => item.id === id);
    if (index < 0) return;
    setLikedPage(Math.floor(index / LIST_PAGE_SIZE) + 1);
    setHighlightedLikedId(id);
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const radarrInstances = data.integrations.filter((i) => i.type === "radarr");
  const sonarrInstances = data.integrations.filter((i) => i.type === "sonarr");
  const plexInstances = data.integrations.filter((i) => i.type === "plex");
  const tautulliInstances = data.integrations.filter((i) => i.type === "tautulli");

  return (
    <div className="px-4 md:px-8 py-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">Settings</h1>
      {message && (
        <p className="mb-4 text-sm text-gray-700 bg-gray-500/10 rounded p-2">{message}</p>
      )}

      <Tabs defaultValue="general">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 rounded-none border-0 bg-transparent p-0 shadow-none backdrop-blur-none">
          <TabsTrigger value="general" className={settingsTabTriggerClassName}>
            General
          </TabsTrigger>
          <TabsTrigger value="radarr" className={settingsTabTriggerClassName}>
            Radarr
          </TabsTrigger>
          <TabsTrigger value="sonarr" className={settingsTabTriggerClassName}>
            Sonarr
          </TabsTrigger>
          <TabsTrigger value="plex" className={settingsTabTriggerClassName}>
            Plex
          </TabsTrigger>
          <TabsTrigger value="tautulli" className={settingsTabTriggerClassName}>
            Tautulli
          </TabsTrigger>
          <TabsTrigger value="recommendations" className={settingsTabTriggerClassName}>
            Recommendations
          </TabsTrigger>
          <TabsTrigger value="home-page" className={settingsTabTriggerClassName}>
            Home Page Sort
          </TabsTrigger>
          <TabsTrigger value="ai" className={settingsTabTriggerClassName}>
            AI
          </TabsTrigger>
          <TabsTrigger value="hide" className={settingsTabTriggerClassName}>
            Hide List
          </TabsTrigger>
          <TabsTrigger value="liked" className={settingsTabTriggerClassName}>
            Liked List
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-4">
          <Card>
            <CardHeader><CardTitle>Account</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Update the password for the account you are signed in with.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setChangePasswordOpen(true)}
              >
                <KeyRound className="h-4 w-4" />
                Change password
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>General</CardTitle></CardHeader>
            <CardContent>
              <form action={saveGeneral} className="space-y-4">
                <div>
                  <Label>TMDB API Key {data.general.tmdbConfigured && "(configured)"}</Label>
                  <Input name="tmdbApiKey" type="password" placeholder="Leave blank to keep existing" className="mt-1" />
                </div>
                <div>
                  <Label>
                    OMDb API Key {data.general.omdbConfigured && "(configured)"}
                  </Label>
                  <Input
                    name="omdbApiKey"
                    type="password"
                    placeholder="Leave blank to keep existing"
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Optional. Free key from{" "}
                    <a
                      href="https://www.omdbapi.com/apikey.aspx"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-700 hover:underline"
                    >
                      omdbapi.com
                    </a>
                    . After signing up, activate the key via the email link before testing.
                    Improves IMDb title lookup in AI chat when TMDB search misses a show.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Region</Label>
                    <Input name="region" defaultValue={data.general.region} className="mt-1" />
                  </div>
                  <div>
                    <Label>Language</Label>
                    <Input name="language" defaultValue={data.general.language} className="mt-1" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="glass">Save</Button>
                  <Button type="button" variant="outline" onClick={() => testConnection("tmdb")}>
                    {testing === "tmdb" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test TMDB"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => testConnection("omdb")}>
                    {testing === "omdb" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test OMDb"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
          <ChangePasswordDialog
            open={changePasswordOpen}
            onOpenChange={setChangePasswordOpen}
          />
        </TabsContent>

        <TabsContent value="radarr" className="mt-6 space-y-4">
          {radarrInstances.map((inst) => (
            <IntegrationCard
              key={inst.id}
              instance={inst}
              onSave={(fd) => saveIntegration("radarr", fd, inst.id)}
              onTest={() => testConnection("radarr", inst.id)}
              onDelete={() => deleteIntegration(inst.id)}
              testing={testing === "radarr" + inst.id}
            />
          ))}
          <NewIntegrationForm type="radarr" label="Radarr" onSave={(fd) => saveIntegration("radarr", fd)} />
        </TabsContent>

        <TabsContent value="sonarr" className="mt-6 space-y-4">
          {sonarrInstances.map((inst) => (
            <IntegrationCard
              key={inst.id}
              instance={inst}
              onSave={(fd) => saveIntegration("sonarr", fd, inst.id)}
              onTest={() => testConnection("sonarr", inst.id)}
              onDelete={() => deleteIntegration(inst.id)}
              testing={testing === "sonarr" + inst.id}
            />
          ))}
          <NewIntegrationForm type="sonarr" label="Sonarr" onSave={(fd) => saveIntegration("sonarr", fd)} />
        </TabsContent>

        <TabsContent value="plex" className="mt-6 space-y-4">
          {plexInstances.map((inst) => (
            <IntegrationCard
              key={inst.id}
              instance={inst}
              isPlex
              onSave={(fd) => saveIntegration("plex", fd, inst.id)}
              onTest={() => testConnection("plex")}
              onDelete={() => deleteIntegration(inst.id)}
              testing={testing === "plex"}
            />
          ))}
          <NewIntegrationForm type="plex" label="Plex" isPlex onSave={(fd) => saveIntegration("plex", fd)} />
          <div className="space-y-2">
            <Button
              variant="outline"
              onClick={() => syncService("plex")}
              disabled={syncBusy || testing === "sync-plex"}
            >
              {plexSyncJob || testing === "sync-plex" ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Sync Plex Library
            </Button>
            {plexSyncJob && (
              <SyncProgressBar
                current={plexSyncJob.progress.current}
                total={plexSyncJob.progress.total}
                message={plexSyncJob.progress.message}
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Server URL should be your Plex Media Server (e.g. http://192.168.x.x:32400), not app.plex.tv.
            If the URL is wrong, Huntarr will try to discover your server from the token.
          </p>
        </TabsContent>

        <TabsContent value="tautulli" className="mt-6 space-y-4">
          {tautulliInstances.map((inst) => (
            <IntegrationCard
              key={inst.id}
              instance={inst}
              onSave={(fd) => saveIntegration("tautulli", fd, inst.id)}
              onTest={() => testConnection("tautulli")}
              onDelete={() => deleteIntegration(inst.id)}
              testing={testing === "tautulli"}
            />
          ))}
          <NewIntegrationForm type="tautulli" label="Tautulli" onSave={(fd) => saveIntegration("tautulli", fd)} />
          <Card>
            <CardHeader><CardTitle>Tautulli Users for Recommendations</CardTitle></CardHeader>
            <CardContent>
              <form action={savePreferences} className="space-y-4">
                <div>
                  <Label>Tautulli users (comma-separated)</Label>
                  <Input
                    name="tautulliUsernames"
                    defaultValue={data.preferences?.tautulliUsernames?.join(", ") ?? ""}
                    placeholder="Alice, Bob"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use Tautulli display names as shown in Tautulli (e.g. Alice, Bob), not Plex account
                    usernames.
                  </p>
                </div>
                <Button type="submit" variant="glass">Save Users</Button>
              </form>
            </CardContent>
          </Card>
          <div className="space-y-2">
            <Button
              variant="outline"
              onClick={() => syncService("tautulli")}
              disabled={syncBusy || testing === "sync-tautulli"}
            >
              {tautulliSyncJob || testing === "sync-tautulli" ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Sync Watch History
            </Button>
            {tautulliSyncJob && (
              <SyncProgressBar
                current={tautulliSyncJob.progress.current}
                total={tautulliSyncJob.progress.total}
                message={tautulliSyncJob.progress.message}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="recommendations" className="mt-6">
          <RecommendationsSettings
            keywords={data.preferences?.recommendationKeywords ?? []}
            onSave={saveRecommendations}
          />
        </TabsContent>

        <TabsContent value="home-page" className="mt-6">
          <HomePageSettings
            homeRowOrder={data.preferences?.homeRowOrder}
            onSave={saveHomePageOrder}
          />
        </TabsContent>

        <TabsContent value="ai" className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            AI providers and API keys are private to your account. Other users must add their own keys.
          </p>
          {data.aiProviders.map((p) => (
            <Card key={p.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{p.name} ({p.provider})</p>
                    <p className="text-sm text-muted-foreground">Model: {p.model}</p>
                    <p className="text-sm text-muted-foreground">Priority: {p.priority}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openAIChange(p)}
                    >
                      Change
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAiTestConfirm({ id: p.id, name: p.name })}
                      disabled={testing === "ai" + p.id}
                    >
                      {testing === "ai" + p.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Test"
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteAI(p.id)} aria-label={`Delete ${p.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          <Dialog
            open={!!aiChange}
            onOpenChange={(open) => {
              if (!open) setAiChange(null);
            }}
          >
            <DialogContent className="border-gray-300/70 bg-white/40 text-gray-900 shadow-none backdrop-blur-md sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-gray-900">
                  Change {aiChange?.name ?? "AI provider"}
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-gray-700">
                Leave a field blank to keep its current value.
              </p>
              <div className="space-y-4 pt-1">
                <div>
                  <Label htmlFor="ai-change-model">Model</Label>
                  <AiModelInput
                    id="ai-change-model"
                    value={aiChangeModel}
                    onChange={setAiChangeModel}
                    placeholder={aiChange?.model ?? "Model"}
                    knownModels={knownAiModels}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="ai-change-priority">Priority</Label>
                  <Input
                    id="ai-change-priority"
                    type="number"
                    value={aiChangePriority}
                    onChange={(e) => setAiChangePriority(e.target.value)}
                    placeholder={
                      aiChange != null ? String(aiChange.priority) : "Priority"
                    }
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Lower number = tried first.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAiChange(null)}
                  disabled={aiChangeSaving}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="glass"
                  onClick={() => void confirmAIChange()}
                  disabled={aiChangeSaving}
                >
                  {aiChangeSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Update"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog
            open={!!aiTestConfirm}
            onOpenChange={(open) => {
              if (!open) setAiTestConfirm(null);
            }}
          >
            <DialogContent className="border-gray-300/70 bg-white/40 text-gray-900 shadow-none backdrop-blur-md sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-gray-900">
                  Test {aiTestConfirm?.name ?? "AI provider"}?
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-gray-700">
                This sends a live request to the provider to verify your API key. It may use a small
                amount of API quota or cost (usually a fraction of a cent; Anthropic uses a 1-token
                ping). Ollama checks are free.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setAiTestConfirm(null)}>
                  Cancel
                </Button>
                <Button type="button" variant="glass" onClick={() => void confirmAITest()}>
                  Approve
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Card>
            <CardHeader><CardTitle>Add AI Provider</CardTitle></CardHeader>
            <CardContent>
              <form action={(fd) => saveAI(fd)} className="space-y-4">
                <div>
                  <Label>Provider</Label>
                  <select name="provider" className="mt-1 w-full rounded-md border border-gray-300/70 bg-white/40 p-2 text-sm text-gray-900 backdrop-blur-md focus-visible:border-gray-400 focus-visible:ring-gray-400">
                    <option value="openrouter">OpenRouter</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="ollama">Ollama</option>
                  </select>
                </div>
                <div>
                  <Label>Name</Label>
                  <Input name="name" placeholder="OpenRouter Primary" className="mt-1" required />
                </div>
                <div>
                  <Label>API Key</Label>
                  <Input name="apiKey" type="password" className="mt-1" />
                </div>
                <div>
                  <Label>Base URL (Ollama only)</Label>
                  <Input name="baseUrl" placeholder="http://host.docker.internal:11434" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="ai-add-model">Model</Label>
                  <AiModelInput
                    id="ai-add-model"
                    name="model"
                    placeholder="openai/gpt-4o"
                    required
                    knownModels={knownAiModels}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Priority</Label>
                  <Input name="priority" type="number" defaultValue="0" className="mt-1" />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Lower number = tried first. Use 0 for OpenRouter, 10 for Claude chat backup.
                    Anthropic/Claude is only used for AI Chat — not For You reranking.
                  </p>
                </div>
                <Button type="submit" variant="glass">Add Provider</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hide" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Hide List</CardTitle>
                <ListItemSearch
                  items={hideSearchItems}
                  onSelect={(item) => jumpToHideItem(item.id)}
                  placeholder="Search hidden titles..."
                  emptyLabel="No hidden titles yet."
                  noMatchLabel="No matching hidden titles."
                  ariaLabel="Search hide list"
                  title="Find a title on your hide list"
                  disabled={sortedHideItems.length === 0}
                />
              </div>
              <p className="text-sm text-muted-foreground">Global and personal hidden titles</p>
            </CardHeader>
            <CardContent>
              {sortedHideItems.length === 0 ? (
                <p className="text-muted-foreground text-sm">No hidden titles. Use Hide on a poster or hide from a movie or TV detail page.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {pagedHideItems.map((item) => (
                      <div
                        key={item.id}
                        id={`hide-item-${item.id}`}
                        className={`flex items-center justify-between rounded-lg border p-3 text-sm backdrop-blur-md transition-colors ${
                          highlightedHideId === item.id
                            ? "border-gray-500 bg-white/80 ring-2 ring-gray-400/60"
                            : "border-gray-300/70 bg-white/40"
                        }`}
                      >
                        <div>
                          <span className="font-medium">{item.title}</span>
                          <span className="text-muted-foreground ml-2 capitalize">{item.mediaType} · {item.scope}</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => removeHideItem(item.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <ListPagination
                    page={safeHidePage}
                    totalPages={hideTotalPages}
                    onPrevious={() => setHidePage((p) => Math.max(1, Math.min(p, hideTotalPages) - 1))}
                    onNext={() => setHidePage((p) => Math.min(hideTotalPages, Math.min(p, hideTotalPages) + 1))}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="liked" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Liked List</CardTitle>
                <ListItemSearch
                  items={likedSearchItems}
                  onSelect={(item) => jumpToLikedItem(item.id)}
                  placeholder="Search liked items..."
                  emptyLabel="Nothing liked yet."
                  noMatchLabel="No matching liked items."
                  ariaLabel="Search liked list"
                  title="Find an item on your liked list"
                  disabled={sortedLikedItems.length === 0}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Shows, movies, and people you have liked. Used to personalize AI recommendations.
              </p>
            </CardHeader>
            <CardContent>
              {sortedLikedItems.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nothing liked yet. Tap Like on a movie, TV show, or person detail page.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    {pagedLikedItems.map((item) => (
                      <div
                        key={item.id}
                        id={`liked-item-${item.id}`}
                        className={`flex items-center justify-between rounded-lg border p-3 text-sm backdrop-blur-md transition-colors ${
                          highlightedLikedId === item.id
                            ? "border-gray-500 bg-white/80 ring-2 ring-gray-400/60"
                            : "border-gray-300/70 bg-white/40"
                        }`}
                      >
                        <div>
                          <span className="font-medium">{item.title}</span>
                          <span className="text-muted-foreground ml-2 capitalize">{item.kind}</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => removeLikedItem(item.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <ListPagination
                    page={safeLikedPage}
                    totalPages={likedTotalPages}
                    onPrevious={() => setLikedPage((p) => Math.max(1, Math.min(p, likedTotalPages) - 1))}
                    onNext={() => setLikedPage((p) => Math.min(likedTotalPages, Math.min(p, likedTotalPages) + 1))}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ListPagination({
  page,
  totalPages: pages,
  onPrevious,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onPrevious}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </Button>
      <span className="min-w-[4rem] text-center text-sm tabular-nums text-muted-foreground">
        {page}/{pages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={page >= pages}
        aria-label="Next page"
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function IntegrationCard({
  instance,
  isPlex,
  onSave,
  onTest,
  onDelete,
  testing,
}: {
  instance: SettingsData["integrations"][0];
  isPlex?: boolean;
  onSave: (fd: FormData) => void;
  onTest: () => void;
  onDelete: () => void;
  testing: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <Card>
      <CardContent className="pt-6">
        {editing ? (
          <form
            action={(fd) => {
              onSave(fd);
              setEditing(false);
            }}
            className="space-y-4"
          >
            <div>
              <Label>Name</Label>
              <Input name="name" defaultValue={instance.name} className="mt-1" required />
            </div>
            <div>
              <Label>Base URL</Label>
              <Input name="baseUrl" defaultValue={instance.baseUrl} className="mt-1" required />
            </div>
            {isPlex ? (
              <div>
                <Label>Plex Token (leave blank to keep)</Label>
                <Input name="token" type="password" className="mt-1" />
              </div>
            ) : (
              <div>
                <Label>API Key (leave blank to keep)</Label>
                <Input name="apiKey" type="password" className="mt-1" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <input type="checkbox" name="isDefault" id={`edit-default-${instance.id}`} defaultChecked={instance.isDefault} />
              <Label htmlFor={`edit-default-${instance.id}`}>Set as default</Label>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="glass">Save</Button>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{instance.name}</p>
              <p className="text-sm text-muted-foreground">{instance.baseUrl}</p>
              {instance.isDefault && <span className="text-xs text-gray-600">Default</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={onTest}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
              </Button>
              <Button variant="ghost" size="sm" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NewIntegrationForm({
  type,
  label,
  isPlex,
  onSave,
}: {
  type: string;
  label: string;
  isPlex?: boolean;
  onSave: (fd: FormData) => void;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>Add {label} Instance</CardTitle></CardHeader>
      <CardContent>
        <form action={onSave} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input name="name" placeholder={`${label} HD`} className="mt-1" required />
          </div>
          <div>
            <Label>Base URL</Label>
            <Input
              name="baseUrl"
              placeholder={isPlex ? "http://192.168.x.x:32400" : "http://host.docker.internal:7878"}
              className="mt-1"
              required
            />
          </div>
          {isPlex ? (
            <div>
              <Label>Plex Token</Label>
              <Input name="token" type="password" className="mt-1" required />
            </div>
          ) : (
            <div>
              <Label>API Key</Label>
              <Input name="apiKey" type="password" className="mt-1" required />
            </div>
          )}
          <div className="flex items-center gap-2">
            <input type="checkbox" name="isDefault" id={`default-${type}`} />
            <Label htmlFor={`default-${type}`}>Set as default</Label>
          </div>
          <Button type="submit" variant="glass">Add Instance</Button>
        </form>
      </CardContent>
    </Card>
  );
}
