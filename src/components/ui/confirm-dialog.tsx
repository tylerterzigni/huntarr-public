"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  loadingLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCloseAutoFocus?: (event: Event) => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  loading = false,
  loadingLabel,
  onConfirm,
  onCloseAutoFocus,
}: ConfirmDialogProps) {
  async function handleConfirm() {
    if (loading) return;
    await onConfirm();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="border-gray-300/70 bg-white/40 text-gray-900 shadow-none backdrop-blur-md sm:max-w-md"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle className="text-gray-900">{title}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-gray-700">{description}</div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="glass"
            disabled={loading}
            onClick={() => void handleConfirm()}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {loadingLabel ?? "Working..."}
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
