import { MediaRow } from "@/components/media/MediaRow";
import { DETAIL_RELATED_LIMIT } from "@/lib/integrations/tmdb/related";
import type { RecommendationItem } from "@/types";

interface TitleDetailRelatedProps {
  recommendations: RecommendationItem[];
  similar: RecommendationItem[];
}

export function TitleDetailRelated({ recommendations, similar }: TitleDetailRelatedProps) {
  if (recommendations.length === 0 && similar.length === 0) return null;

  return (
    <div className="mt-2">
      <MediaRow
        title="Recommendations"
        items={recommendations}
        showReason={false}
        visibleLimit={DETAIL_RELATED_LIMIT}
      />
      <MediaRow
        title="Similar Titles"
        items={similar}
        showReason={false}
        visibleLimit={DETAIL_RELATED_LIMIT}
      />
    </div>
  );
}
