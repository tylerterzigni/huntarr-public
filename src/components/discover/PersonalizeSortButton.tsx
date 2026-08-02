"use client";

import { Loader2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PersonalizeSortButtonProps {
  active: boolean;
  loading: boolean;
  onToggle: () => void;
  defaultOrderLabel?: string;
}

export function PersonalizeSortButton({
  active,
  loading,
  onToggle,
  defaultOrderLabel = "default",
}: PersonalizeSortButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={`h-8 w-8 shrink-0 ${
        active ? "bg-gray-200 text-gray-900 hover:bg-gray-300" : "text-gray-600 hover:text-gray-900"
      }`}
      onClick={onToggle}
      disabled={loading}
      aria-label={active ? `Show ${defaultOrderLabel} sort order` : "Sort by personalized recommendations"}
      aria-pressed={active}
      title={
        active
          ? `Showing your personalized order — click for ${defaultOrderLabel}`
          : "Sort by your taste"
      }
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <UserRound className="h-4 w-4" />
      )}
    </Button>
  );
}
