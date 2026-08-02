"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { glassBtn, glassDropdown } from "@/lib/styles/glass";

interface FilterDateInputProps {
  /** Current committed filter value (`YYYY-MM-DD` or empty). */
  value: string;
  onCommit: (value: string) => void;
  className?: string;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseISODate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildMonthDays(month: Date): Array<Date | null> {
  const first = startOfMonth(month);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const leading = first.getDay();
  const cells: Array<Date | null> = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(first.getFullYear(), first.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Custom date filter control (no native date picker).
 * Native OS calendars label the action "Reset" and often fail to clear controlled inputs;
 * this popup uses an explicit Clear action that always blanks the field.
 */
export function FilterDateInput({ value, onCommit, className }: FilterDateInputProps) {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const selected = useMemo(() => parseISODate(value), [value]);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected ?? new Date()));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setViewMonth(startOfMonth(selected ?? new Date()));
  }, [open, selected]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    function positionPanel() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const panelWidth = Math.min(300, Math.max(260, rect.width));
      const left = Math.min(
        Math.max(8, rect.left),
        window.innerWidth - panelWidth - 8
      );
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < 320 && rect.top > spaceBelow;
      setPanelStyle({
        position: "fixed",
        left,
        width: panelWidth,
        top: openUp ? undefined : rect.bottom + 6,
        bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
        zIndex: 80,
      });
    }

    positionPanel();
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    return () => {
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const monthLabel = viewMonth.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
  const days = useMemo(() => buildMonthDays(viewMonth), [viewMonth]);
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  function clearDate() {
    onCommit("");
    setOpen(false);
  }

  function selectDate(date: Date) {
    onCommit(toISODate(date));
    setOpen(false);
  }

  return (
    <div className="relative mt-1">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex h-10 w-full items-center rounded-md border px-3 py-2 text-left text-sm shadow-none ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
          className
        )}
      >
        <CalendarDays className="mr-2 h-4 w-4 shrink-0 text-gray-500" />
        <span className={cn("flex-1 truncate", !value && "text-gray-500")}>
          {value || "yyyy-mm-dd"}
        </span>
        {value ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear date"
            className="rounded p-1 text-gray-500 hover:bg-white/55 hover:text-gray-900"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              clearDate();
            }}
          >
            <X className="h-4 w-4" />
          </span>
        ) : null}
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={panelRef}
            id={listboxId}
            role="dialog"
            aria-label="Choose date"
            style={panelStyle}
            className={cn("rounded-lg p-3 shadow-lg", glassDropdown)}
            data-allow-touch-scroll
            data-no-pull-refresh
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label="Previous month"
                className="rounded-md p-1.5 text-gray-600 hover:bg-white/55 hover:text-gray-900"
                onClick={() => setViewMonth((month) => addMonths(month, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="text-sm font-medium text-gray-900">{monthLabel}</p>
              <button
                type="button"
                aria-label="Next month"
                className="rounded-md p-1.5 text-gray-600 hover:bg-white/55 hover:text-gray-900"
                onClick={() => setViewMonth((month) => addMonths(month, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((label) => (
                <div
                  key={label}
                  className="py-1 text-center text-[11px] font-medium text-gray-500"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((date, index) => {
                if (!date) {
                  return <div key={`empty-${index}`} className="h-9" />;
                }
                const iso = toISODate(date);
                const isSelected = selected ? isSameDay(date, selected) : false;
                const isToday = isSameDay(date, today);
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => selectDate(date)}
                    className={cn(
                      "h-9 rounded-md text-sm text-gray-900 hover:bg-white/70",
                      isToday && !isSelected && "ring-1 ring-gray-400/70",
                      isSelected && "bg-gray-900 text-white hover:bg-gray-900"
                    )}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-300/70 pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(glassBtn)}
                onClick={clearDate}
              >
                Clear
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
