"use client";

import { useCallback, useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";

interface FilterRangeSliderProps {
  min: number;
  max: number;
  step?: number;
  defaultMin: number;
  defaultMax: number;
  valueMin?: number;
  valueMax?: number;
  formatSubText: (min: number, max: number) => string;
  onChange: (min: number, max: number) => void;
}

function formatValue(value: number, step: number): string {
  if (step >= 1) return String(Math.round(value));
  return value.toFixed(1).replace(/\.0$/, "");
}

export function FilterRangeSlider({
  min,
  max,
  step = 1,
  defaultMin,
  defaultMax,
  valueMin,
  valueMax,
  formatSubText,
  onChange,
}: FilterRangeSliderProps) {
  const resolvedMin = valueMin ?? defaultMin;
  const resolvedMax = valueMax ?? defaultMax;

  const [values, setValues] = useState<[number, number]>([resolvedMin, resolvedMax]);

  useEffect(() => {
    setValues([resolvedMin, resolvedMax]);
  }, [resolvedMin, resolvedMax]);

  const handleCommit = useCallback(
    (next: number[]) => {
      const [nextMin, nextMax] = next as [number, number];
      onChange(nextMin, nextMax);
    },
    [onChange]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatValue(values[0], step)}</span>
        <span>{formatValue(values[1], step)}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        minStepsBetweenThumbs={1}
        value={values}
        onValueChange={(next) => setValues(next as [number, number])}
        onValueCommit={handleCommit}
      />
      <p className="text-sm text-muted-foreground">{formatSubText(values[0], values[1])}</p>
    </div>
  );
}
