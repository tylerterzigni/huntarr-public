"use client";

import { useState } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { dispatchRemindersChanged } from "@/lib/reminders/client";
import type { MediaType } from "@/types";

interface RemindMeButtonProps {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  trailerUrl: string | null;
  initialReminded: boolean;
  className?: string;
}

const baseBtn =
  "inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium shadow-none transition-colors duration-150 ease-in-out disabled:opacity-60";

const remindBtn =
  "border-gray-300/70 bg-white/40 text-gray-800 backdrop-blur-md hover:border-gray-400 hover:bg-white/55";

const remindedBtn =
  "border-amber-500/70 bg-amber-500/20 text-amber-900 hover:border-amber-600 hover:bg-amber-500/30";

export function RemindMeButton({
  tmdbId,
  mediaType,
  title,
  year,
  posterPath,
  trailerUrl,
  initialReminded,
  className,
}: RemindMeButtonProps) {
  const [reminded, setReminded] = useState(initialReminded);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (loading) return;
    setLoading(true);
    setError(null);
    const nextReminded = !reminded;
    try {
      const res = nextReminded
        ? await fetch("/api/reminders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tmdbId, mediaType, title, year, posterPath, trailerUrl }),
          })
        : await fetch(`/api/reminders?tmdbId=${tmdbId}&mediaType=${mediaType}`, {
            method: "DELETE",
          });
      if (!res.ok && !(nextReminded && res.status === 409)) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Something went wrong");
      }
      setReminded(nextReminded);
      dispatchRemindersChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <button
        type="button"
        className={cn(baseBtn, "w-full", reminded ? remindedBtn : remindBtn)}
        aria-label={reminded ? `Remove reminder for ${title}` : `Remind me about ${title}`}
        title={reminded ? "Remove from Reminders" : "Add to Reminders"}
        disabled={loading}
        onClick={() => void toggle()}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        ) : reminded ? (
          <BellRing className="h-4 w-4 shrink-0 text-amber-700" />
        ) : (
          <Bell className="h-4 w-4 shrink-0" />
        )}
        <span className="truncate font-semibold">{reminded ? "Reminder Set" : "Remind Me"}</span>
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
