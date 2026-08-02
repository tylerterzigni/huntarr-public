"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface GenreMultiSelectProps {
  genres: Array<{ id: number; name: string }>;
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function GenreMultiSelect({ genres, selected, onChange }: GenreMultiSelectProps) {
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
    (id: string) => {
      if (selected.includes(id)) {
        onChange(selected.filter((g) => g !== id));
      } else {
        onChange([...selected, id]);
      }
    },
    [selected, onChange]
  );

  const summary =
    selected.length === 0
      ? "All genres"
      : selected.length === 1
        ? genres.find((g) => String(g.id) === selected[0])?.name ?? selected[0]
        : `${selected.length} genres selected`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between rounded-md border border-gray-300/70 bg-white/40 p-2.5 text-sm text-left text-gray-900 backdrop-blur-md",
          open && "ring-1 ring-seerr-accent"
        )}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-gray-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-300/70 bg-white/40 py-1 shadow-lg backdrop-blur-md">
          {genres.map((genre) => {
            const id = String(genre.id);
            return (
              <label
                key={genre.id}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-seerr-hover"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(id)}
                  onChange={() => toggle(id)}
                  className="h-4 w-4 rounded border-gray-300/70 bg-white/60 text-seerr-accent focus:ring-gray-400"
                />
                <span>{genre.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
