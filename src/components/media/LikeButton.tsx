"use client";

import { useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LikedKind } from "@/lib/liked-list";

interface LikeButtonProps {
  tmdbId: number;
  kind: LikedKind;
  title: string;
  initialLiked: boolean;
  className?: string;
}

const baseBtn =
  "inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 text-sm font-medium shadow-none transition-colors duration-150 ease-in-out disabled:opacity-60";

const likeBtn =
  "border-gray-300/70 bg-white/40 text-gray-800 backdrop-blur-md hover:border-gray-400 hover:bg-white/55";

const likedBtn =
  "border-emerald-500/70 bg-emerald-500/20 text-emerald-800 hover:border-emerald-600 hover:bg-emerald-500/30";

export function LikeButton({
  tmdbId,
  kind,
  title,
  initialLiked,
  className,
}: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (loading) return;
    setLoading(true);
    const nextLiked = !liked;
    try {
      if (nextLiked) {
        const res = await fetch("/api/liked-list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tmdbId, kind, title }),
        });
        if (!res.ok && res.status !== 409) {
          throw new Error("Failed to like");
        }
      } else {
        const res = await fetch(
          `/api/liked-list?tmdbId=${tmdbId}&kind=${encodeURIComponent(kind)}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          throw new Error("Failed to unlike");
        }
      }
      setLiked(nextLiked);
    } catch {
      // keep previous state on failure
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className={cn(baseBtn, liked ? likedBtn : likeBtn, className)}
      aria-label={liked ? `Unlike ${title}` : `Like ${title}`}
      title={liked ? "Remove from Liked List" : "Add to Liked List"}
      disabled={loading}
      onClick={() => void toggle()}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Heart className={cn("h-4 w-4 shrink-0", liked && "fill-emerald-600 text-emerald-600")} />
      )}
      <span className="truncate font-semibold">{liked ? "Liked" : "Like"}</span>
    </button>
  );
}
