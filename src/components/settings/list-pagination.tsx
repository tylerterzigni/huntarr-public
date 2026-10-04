"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const LIST_PAGE_SIZE = 20;

export function sortByTitle<T extends { title: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
  );
}

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function totalPages(count: number, pageSize: number): number {
  return Math.max(1, Math.ceil(count / pageSize));
}

export function ListPagination({
  page,
  totalPages: pages,
  onPrevious,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onPrevious}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </Button>
      <span className="min-w-[4rem] text-center text-sm tabular-nums text-muted-foreground">
        {page}/{pages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={page >= pages}
        aria-label="Next page"
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
