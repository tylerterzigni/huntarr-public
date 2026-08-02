"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ENGLISH_CODE = "en";

interface LanguageOption {
  code: string;
  label: string;
}

interface LanguageSelectProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

function formatLanguageLabel(code: string, englishName?: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? englishName ?? code.toUpperCase();
  } catch {
    return englishName ?? code.toUpperCase();
  }
}

function sortLanguages(options: LanguageOption[]): LanguageOption[] {
  const english = options.find((option) => option.code === ENGLISH_CODE);
  const rest = options
    .filter((option) => option.code !== ENGLISH_CODE)
    .sort((a, b) => a.label.localeCompare(b.label));

  return english ? [english, ...rest] : rest;
}

export function LanguageSelect({ selected, onChange }: LanguageSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    let cancelled = false;

    async function loadLanguages() {
      setLoading(true);
      try {
        const res = await fetch("/api/tmdb/languages");
        const data = await res.json();
        const items: Array<{ iso_639_1: string; english_name: string }> = data.languages ?? [];
        if (cancelled) return;

        const options = sortLanguages(
          items
            .filter((item) => item.iso_639_1)
            .map((item) => ({
              code: item.iso_639_1,
              label: formatLanguageLabel(item.iso_639_1, item.english_name),
            }))
        );

        setLanguages(options);
      } catch {
        if (!cancelled) setLanguages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadLanguages();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(
    (code: string) => {
      if (selected.includes(code)) {
        onChange(selected.filter((item) => item !== code));
      } else {
        onChange([...selected, code]);
      }
    },
    [selected, onChange]
  );

  const summary = useMemo(() => {
    if (selected.length === 0) return "All Languages";
    if (selected.length === 1) {
      return languages.find((lang) => lang.code === selected[0])?.label ?? selected[0].toUpperCase();
    }
    return `${selected.length} languages selected`;
  }, [languages, selected]);

  const filteredLanguages = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const matches = trimmed
      ? languages.filter(
          (lang) =>
            lang.label.toLowerCase().includes(trimmed) || lang.code.toLowerCase().includes(trimmed)
        )
      : languages;

    return sortLanguages(matches);
  }, [languages, query]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex w-full items-center justify-between rounded-md border border-gray-300/70 bg-white/40 p-2.5 text-sm text-left text-gray-900 backdrop-blur-md",
          open && "ring-1 ring-seerr-accent"
        )}
      >
        <span className="truncate">{loading ? "Loading languages…" : summary}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-gray-400 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-gray-300/70 bg-white/40 shadow-lg backdrop-blur-md">
          <div className="border-b border-gray-300/70 p-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search languages…"
              autoFocus
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filteredLanguages.map((lang) => (
              <label
                key={lang.code}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-seerr-hover"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(lang.code)}
                  onChange={() => toggle(lang.code)}
                  className="h-4 w-4 rounded border-gray-300/70 bg-white/60 text-seerr-accent focus:ring-gray-400"
                />
                <span>{lang.label}</span>
                <span className="ml-auto text-xs text-gray-500">{lang.code}</span>
              </label>
            ))}
            {!loading && filteredLanguages.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">No languages found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
