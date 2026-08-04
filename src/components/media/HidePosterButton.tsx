"use client";

import { useState } from "react";
import { EyeOff, Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { dispatchTitleHidden } from "@/lib/hide-list/client";
import { cn } from "@/lib/utils";
import type { MediaType } from "@/types";

interface HidePosterButtonProps {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  visible?: boolean;
  onHidden?: () => void;
  onDialogClose?: () => void;
  onDialogOpenChange?: (open: boolean) => void;
  className?: string;
}

const CLICK_THROUGH_GUARD_MS = 800;

function suppressDialogClickThrough() {
  const stop = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  document.addEventListener("click", stop, true);
  document.addEventListener("pointerup", stop, true);
  window.setTimeout(() => {
    document.removeEventListener("click", stop, true);
    document.removeEventListener("pointerup", stop, true);
  }, CLICK_THROUGH_GUARD_MS);
}

export function HidePosterButton({
  tmdbId,
  mediaType,
  title,
  visible = false,
  onHidden,
  onDialogClose,
  onDialogOpenChange,
  className,
}: HidePosterButtonProps) {
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isShown = visible || loading || confirmOpen;

  function stopMediaActionBubble(event: React.SyntheticEvent) {
    event.stopPropagation();
  }

  function guardPosterNavigation() {
    suppressDialogClickThrough();
    onDialogClose?.();
  }

  function handleTriggerClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (loading) return;
    guardPosterNavigation();
    setConfirmOpen(true);
    onDialogOpenChange?.(true);
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open) {
      guardPosterNavigation();
    }
    setConfirmOpen(open);
    onDialogOpenChange?.(open);
  }

  async function confirmHide() {
    if (loading) return;

    guardPosterNavigation();
    setLoading(true);
    try {
      const res = await fetch("/api/hide-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId, mediaType, title, scope: "user" }),
      });

      if (res.ok || res.status === 409) {
        guardPosterNavigation();
        dispatchTitleHidden({ tmdbId, mediaType });
        onHidden?.();
        setConfirmOpen(false);
        onDialogOpenChange?.(false);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div
        data-media-action
        onClick={stopMediaActionBubble}
        onMouseDown={stopMediaActionBubble}
        className={cn(
          "absolute top-2 right-2 z-50 transition-opacity",
          isShown ? "opacity-100" : "pointer-events-none opacity-0",
          className
        )}
      >
        <button
          type="button"
          title="Add to Blocklist"
          aria-label={`Hide ${title}`}
          disabled={loading}
          onClick={handleTriggerClick}
          onMouseDown={stopMediaActionBubble}
          className="pointer-events-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-black/80 text-white shadow-lg transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-70"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={handleDialogOpenChange}
        title={`Hide ${title}?`}
        description="This will add the title to your personal blocklist. Hidden titles no longer appear in browse and recommendations. You can remove them from Settings → Hide List."
        confirmLabel="Hide"
        loading={loading}
        loadingLabel="Hiding..."
        onConfirm={() => {
          guardPosterNavigation();
          void confirmHide();
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
      />
    </>
  );
}
