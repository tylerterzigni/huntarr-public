import type { PersonalizeBrowseStreamEvent } from "@/lib/recommendations/engine";
import { DISCOVER_PERSONALIZE_MAX } from "@/lib/recommendations/constants";
import type { RecommendationItem } from "@/types";

export type PersonalizeStreamCallbacks = {
  onEvent: (event: PersonalizeBrowseStreamEvent) => void;
  onError?: (error: Error) => void;
};

function parseSseBuffer(buffer: string, onEvent: (event: PersonalizeBrowseStreamEvent) => void): string {
  const parts = buffer.split("\n\n");
  const remainder = parts.pop() ?? "";

  for (const part of parts) {
    const line = part
      .split("\n")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith("data: "));
    if (!line) continue;
    onEvent(JSON.parse(line.slice(6)) as PersonalizeBrowseStreamEvent);
  }

  return remainder;
}

export async function streamPersonalizeBrowse(
  items: RecommendationItem[],
  { onEvent, onError }: PersonalizeStreamCallbacks
): Promise<void> {
  // Discover auto-rolls far past the API cap; keep popularity order (list order) and trim.
  const payload = items
    .map((item) => ({ ...item, id: Number(item.id) }))
    .filter((item) => Number.isFinite(item.id) && item.id > 0)
    .slice(0, DISCOVER_PERSONALIZE_MAX);
  if (payload.length === 0) {
    throw new Error("No results to personalize.");
  }

  const res = await fetch("/api/recommendations/personalize-browse/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: payload }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Failed to personalize results");
  }

  if (!res.body) {
    throw new Error("No response body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
        buffer = parseSseBuffer(buffer, onEvent);
      }
      if (done) break;
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      parseSseBuffer(`${buffer}\n\n`, onEvent);
    }
  } catch (err) {
    onError?.(err instanceof Error ? err : new Error("Stream failed"));
    throw err;
  }
}
