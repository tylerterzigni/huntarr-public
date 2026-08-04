"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { forgetModel, mergeModelHistory } from "@/lib/ai/model-history";

interface AiModelInputProps {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
  /** Models currently configured on providers — seeded into history. */
  knownModels?: string[];
}

export function AiModelInput({
  id,
  name,
  value,
  defaultValue,
  onChange,
  placeholder,
  required,
  className,
  disabled,
  knownModels = [],
}: AiModelInputProps) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const isControlled = value !== undefined;

  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? "");
  const currentValue = isControlled ? value : uncontrolledValue;

  const [history, setHistory] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const knownKey = useMemo(
    () =>
      [...knownModels]
        .map((model) => model.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .join("\0"),
    [knownModels]
  );

  useEffect(() => {
    setHistory(mergeModelHistory(knownModels));
    // knownKey fingerprints knownModels contents
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownKey]);

  const suggestions = useMemo(() => {
    const query = currentValue.trim().toLowerCase();
    if (!query) return history;
    return history.filter((model) => model.toLowerCase().includes(query));
  }, [history, currentValue]);

  useEffect(() => {
    setHighlightIndex((prev) => {
      if (suggestions.length === 0) return -1;
      if (prev < 0) return prev;
      return Math.min(prev, suggestions.length - 1);
    });
  }, [suggestions]);

  useEffect(() => {
    if (!open || highlightIndex < 0) return;
    const item = listRef.current?.children[highlightIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  const setValue = useCallback(
    (next: string) => {
      if (!isControlled) setUncontrolledValue(next);
      onChange?.(next);
    },
    [isControlled, onChange]
  );

  const close = useCallback(() => {
    setOpen(false);
    setHighlightIndex(-1);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (containerRef.current?.contains(target)) return;
      close();
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, close]);

  function selectModel(model: string) {
    setValue(model);
    close();
    inputRef.current?.focus();
  }

  function removeHighlightedModel() {
    if (highlightIndex < 0 || highlightIndex >= suggestions.length) return;
    const model = suggestions[highlightIndex];
    setHistory(forgetModel(model));
    setHighlightIndex((prev) => {
      const remaining = suggestions.length - 1;
      if (remaining <= 0) return -1;
      return Math.min(prev, remaining - 1);
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        close();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlightIndex(suggestions.length > 0 ? 0 : -1);
        return;
      }
      if (suggestions.length === 0) return;
      setHighlightIndex((prev) => (prev + 1) % suggestions.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlightIndex(suggestions.length > 0 ? suggestions.length - 1 : -1);
        return;
      }
      if (suggestions.length === 0) return;
      setHighlightIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      return;
    }

    if (e.key === "Enter" && open && highlightIndex >= 0 && suggestions[highlightIndex]) {
      e.preventDefault();
      selectModel(suggestions[highlightIndex]);
      return;
    }

    if (e.key === "Delete" && open && highlightIndex >= 0) {
      e.preventDefault();
      removeHighlightedModel();
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          name={name}
          value={currentValue}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && highlightIndex >= 0 ? `${listId}-option-${highlightIndex}` : undefined
          }
          className="pr-9"
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            setHighlightIndex(-1);
          }}
          onFocus={() => {
            setHistory(mergeModelHistory(knownModels));
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Show previously used models"
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-gray-600 disabled:opacity-50"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (open) {
              close();
              return;
            }
            setHistory(mergeModelHistory(knownModels));
            setOpen(true);
            inputRef.current?.focus();
          }}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Previously used models"
          className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-gray-300/70 bg-white/95 py-1 text-sm text-gray-900 shadow-md backdrop-blur-md"
        >
          {suggestions.length === 0 ? (
            <li className="px-3 py-2 text-gray-500">
              {history.length === 0
                ? "No previously used models yet."
                : "No matching models."}
            </li>
          ) : (
            suggestions.map((model, index) => (
              <li
                key={model}
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={index === highlightIndex}
                className={cn(
                  "cursor-pointer px-3 py-2",
                  index === highlightIndex
                    ? "bg-gray-900/10"
                    : "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-gray-900/5"
                )}
                onMouseEnter={() => setHighlightIndex(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectModel(model)}
              >
                {model}
              </li>
            ))
          )}
          {suggestions.length > 0 && (
            <li className="border-t border-gray-200 px-3 py-1.5 text-xs text-gray-500">
              Arrow keys to move · Delete removes a suggestion · Enter selects
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
