"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface KeywordItem {
  id: number;
  name: string;
}

interface KeywordSelectorProps {
  selected: KeywordItem[];
  onChange: (selected: KeywordItem[]) => void;
  placeholder?: string;
}

export function KeywordSelector({
  selected,
  onChange,
  placeholder = "Search keywords…",
}: KeywordSelectorProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KeywordItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
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
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/tmdb/keywords?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        const items: KeywordItem[] = data.results ?? [];
        setResults(items.filter((item) => !selected.some((s) => s.id === item.id)));
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, selected]);

  const addKeyword = useCallback(
    (item: KeywordItem) => {
      if (!selected.some((s) => s.id === item.id)) {
        onChange([...selected, item]);
      }
      setQuery("");
      setResults([]);
      setOpen(false);
    },
    [selected, onChange]
  );

  const removeKeyword = useCallback(
    (id: number) => {
      onChange(selected.filter((s) => s.id !== id));
    },
    [selected, onChange]
  );

  return (
    <div ref={containerRef} className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-600/30 px-2.5 py-1 text-xs"
            >
              {item.name}
              <button
                type="button"
                onClick={() => removeKeyword(item.id)}
                className="text-gray-500 hover:text-gray-900"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && setOpen(true)}
          placeholder={placeholder}
          className="border-gray-300/70 bg-white/40 backdrop-blur-md"
        />
        {open && (results.length > 0 || loading) && (
          <div className="absolute z-30 mt-1 w-full rounded-md border border-gray-300/70 bg-white/40 py-1 shadow-lg backdrop-blur-md">
            {loading && (
              <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
            )}
            {results.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addKeyword(item)}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-seerr-hover"
                )}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
