import Link from "next/link";
import type { MediaType } from "@/types";

interface KeywordsSectionProps {
  keywords: Array<{ id: number; name: string }>;
  mediaType: MediaType;
}

export function KeywordsSection({ keywords, mediaType }: KeywordsSectionProps) {
  if (keywords.length === 0) return null;

  const discoverPath = mediaType === "movie" ? "/movies" : "/tv";

  return (
    <section className="mt-6">
      <div className="flex flex-wrap gap-2">
        {keywords.map((keyword) => (
          <Link
            key={keyword.id}
            href={`${discoverPath}?keywords=${keyword.id}`}
            className="rounded-full border border-gray-300/70 bg-white/40 px-3 py-1 text-sm text-gray-700 backdrop-blur-md transition-colors hover:border-gray-400 hover:bg-white/55 hover:text-gray-900"
          >
            {keyword.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
