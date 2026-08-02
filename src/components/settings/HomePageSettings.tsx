"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEFAULT_HOME_ROW_ORDER,
  HOME_ROW_LABELS,
  normalizeHomeRowOrder,
  type HomeRowId,
} from "@/lib/home/row-order";

interface HomePageSettingsProps {
  homeRowOrder: string[] | null | undefined;
  onSave: (order: HomeRowId[]) => Promise<void>;
}

export function HomePageSettings({ homeRowOrder, onSave }: HomePageSettingsProps) {
  const [order, setOrder] = useState<HomeRowId[]>(() => normalizeHomeRowOrder(homeRowOrder));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOrder(normalizeHomeRowOrder(homeRowOrder));
  }, [homeRowOrder]);

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

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(order);
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setOrder([...DEFAULT_HOME_ROW_ORDER]);
  }

  const isDefault =
    order.length === DEFAULT_HOME_ROW_ORDER.length &&
    order.every((id, i) => id === DEFAULT_HOME_ROW_ORDER[i]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Home Page Sort</CardTitle>
        <p className="text-sm text-muted-foreground">
          Choose the order of recommendation rows on your home page. Move a row up or down until the
          layout matches how you like to browse.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {order.map((rowId, index) => (
            <li
              key={rowId}
              className="flex items-center gap-3 rounded-lg border border-gray-300/70 bg-white/40 px-3 py-2 backdrop-blur-md"
            >
              <span className="w-6 shrink-0 text-center text-sm text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium text-gray-900">
                {HOME_ROW_LABELS[rowId]}
              </span>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${HOME_ROW_LABELS[rowId]} up`}
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
                  aria-label={`Move ${HOME_ROW_LABELS[rowId]} down`}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save row order
          </Button>
          <Button type="button" variant="outline" onClick={handleReset} disabled={isDefault || saving}>
            Reset to default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
