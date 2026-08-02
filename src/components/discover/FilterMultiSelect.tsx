"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FilterOption {
  code: string;
  label: string;
}

interface FilterMultiSelectProps {
  label: string;
  options: readonly FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function FilterMultiSelect({ label, options, selected, onChange }: FilterMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggle = useCallback(
    (code: string) => {
      if (selected.includes(code)) {
        onChange(selected.filter((c) => c !== code));
      } else {
        onChange([...selected, code]);
      }
    },
    [selected, onChange]
  );

  const summary =
    selected.length === 0
      ? "All"
      : selected.length === 1
        ? options.find((o) => o.code === selected[0])?.label ?? selected[0]
        : `${selected.length} selected`;

  return (
    <div ref={containerRef} className="relative">
      {label && <Label className="text-xs">{label}</Label>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between rounded-md border border-gray-300/70 bg-white/40 p-2 text-sm text-left text-gray-900 backdrop-blur-md",
          label && "mt-1",
          open && "ring-1 ring-seerr-accent"
        )}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-gray-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[200px] rounded-md border border-gray-300/70 bg-white/40 py-1 shadow-lg backdrop-blur-md">
          {options.map((option) => {
            const isSelected = selected.includes(option.code);
            return (
              <button
                key={option.code}
                type="button"
                onClick={() => toggle(option.code)}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-seerr-hover"
              >
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded border border-gray-300/70 bg-white/60",
                    isSelected && "border-seerr-accent bg-seerr-accent"
                  )}
                  aria-hidden
                >
                  {isSelected && <span className="h-2 w-2 rounded-sm bg-white" />}
                </span>
                <span>{option.label}</span>
                <span className="ml-auto text-xs text-gray-500">{option.code}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
