"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SlideOverProps {
  open: boolean;
  title: string;
  subText?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function SlideOver({ open, title, subText, onClose, children }: SlideOverProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setVisible(true);
      document.body.style.overflow = "hidden";
    } else {
      setVisible(false);
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close filters"
        className={cn(
          "absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "relative flex h-full w-full max-w-lg flex-col border-l border-gray-300/70 bg-white/40 backdrop-blur-xl shadow-none transition-transform duration-300 ease-in-out sm:max-w-xl",
          visible ? "translate-x-0" : "translate-x-full"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-300/70 px-6 pb-5 pt-safe">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            {subText && <p className="mt-1 text-sm text-muted-foreground">{subText}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-500 hover:bg-white/55 hover:text-gray-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 pb-safe">{children}</div>
      </div>
    </div>,
    document.body
  );
}
