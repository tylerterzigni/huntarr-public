"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RecommendationsSettingsProps {
  keywords: string[];
  onSave: (keywords: string[]) => Promise<void>;
}

export function RecommendationsSettings({ keywords, onSave }: RecommendationsSettingsProps) {
  const [tags, setTags] = useState(keywords);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTags(keywords);
  }, [keywords]);

  function addKeyword(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const exists = tags.some((tag) => tag.toLowerCase() === trimmed.toLowerCase());
    if (exists || tags.length >= 20) return;
    setTags((prev) => [...prev, trimmed]);
    setInput("");
  }

  function removeKeyword(index: number) {
    setTags((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(tags);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recommendation Keywords</CardTitle>
        <p className="text-sm text-muted-foreground">
          Add themes and topics Huntarr should prioritize in your For You row and AI recommendations
          (e.g. heist, time travel, romantic comedy, sci-fi).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="recommendation-keyword">Keywords</Label>
          <div className="mt-2 flex gap-2">
            <Input
              id="recommendation-keyword"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword(input);
                }
              }}
              placeholder="Type a keyword and press Enter"
              disabled={tags.length >= 20}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => addKeyword(input)}
              disabled={!input.trim() || tags.length >= 20}
            >
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Up to 20 keywords. Saved keywords also influence TMDB discover searches.
          </p>
        </div>

        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, index) => (
              <span
                key={`${tag}-${index}`}
                className="inline-flex items-center gap-1 rounded-full border border-gray-300/70 bg-white/40 px-3 py-1 text-sm text-gray-900 backdrop-blur-md"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeKeyword(index)}
                  className="rounded-full p-0.5 text-gray-500 hover:text-gray-900"
                  aria-label={`Remove ${tag}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No keywords yet. Add a few themes you want more of in recommendations.
          </p>
        )}

        <Button type="button" variant="glass" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Keywords"}
        </Button>
      </CardContent>
    </Card>
  );
}
