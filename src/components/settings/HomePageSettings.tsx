"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  DEFAULT_HOME_ROW_ORDER,
  HOME_ROW_LABELS,
  normalizeHomeRowHidden,
  normalizeHomeRowOrder,
  type HomeRowId,
} from "@/lib/home/row-order";

interface HomePageSettingsProps {
  homeRowOrder: string[] | null | undefined;
  homeRowHidden: string[] | null | undefined;
  onSave: (order: HomeRowId[], hidden: HomeRowId[]) => Promise<void>;
}

export function HomePageSettings({
  homeRowOrder,
  homeRowHidden,
  onSave,
}: HomePageSettingsProps) {
  const [order, setOrder] = useState<HomeRowId[]>(() => normalizeHomeRowOrder(homeRowOrder));
  const [hidden, setHidden] = useState<HomeRowId[]>(() =>
    normalizeHomeRowHidden(homeRowHidden)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOrder(normalizeHomeRowOrder(homeRowOrder));
  }, [homeRowOrder]);

  useEffect(() => {
    setHidden(normalizeHomeRowHidden(homeRowHidden));
  }, [homeRowHidden]);

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= order.length) return;
    setOrder((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  function toggleHidden(rowId: HomeRowId) {
    setHidden((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(order, hidden);
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setOrder([...DEFAULT_HOME_ROW_ORDER]);
    setHidden([]);
  }

  const hiddenSet = new Set(hidden);
  const isDefault =
    hidden.length === 0 &&
    order.length === DEFAULT_HOME_ROW_ORDER.length &&
    order.every((id, i) => id === DEFAULT_HOME_ROW_ORDER[i]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Home Page Sort</CardTitle>
        <p className="text-sm text-muted-foreground">
          Choose the order of recommendation rows on your home page. Hide any row you do not want
          to see, then save.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {order.map((rowId, index) => {
            const isHidden = hiddenSet.has(rowId);
            const label = HOME_ROW_LABELS[rowId];
            return (
              <li
                key={rowId}
                className="isolate rounded-lg border border-gray-300/70 bg-white/40 backdrop-blur-md"
              >
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2",
                    isHidden && "opacity-60"
                  )}
                >
                  <span className="w-6 shrink-0 text-center text-sm text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-gray-900">
                    {label}
                    {isHidden && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        Hidden
                      </span>
                    )}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${label} up`}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => move(index, 1)}
                      disabled={index === order.length - 1}
                      aria-label={`Move ${label} down`}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={cn(
                        "h-8 w-8",
                        isHidden
                          ? "border-red-300/80 bg-red-500/10 text-red-800 hover:bg-red-500/15 hover:text-red-900"
                          : "border-emerald-300/80 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/15 hover:text-emerald-900"
                      )}
                      onClick={() => toggleHidden(rowId)}
                      aria-label={
                        isHidden ? `Show ${label} on home page` : `Hide ${label} from home page`
                      }
                      aria-pressed={isHidden}
                    >
                      {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save layout
          </Button>
          <Button type="button" variant="outline" onClick={handleReset} disabled={isDefault || saving}>
            Reset to default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
