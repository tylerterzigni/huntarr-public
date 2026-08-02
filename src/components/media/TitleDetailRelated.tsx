import { MediaRow } from "@/components/media/MediaRow";
import type { RecommendationItem } from "@/types";

interface TitleDetailRelatedProps {
  recommendations: RecommendationItem[];
  similar: RecommendationItem[];
}

export function TitleDetailRelated({ recommendations, similar }: TitleDetailRelatedProps) {
  if (recommendations.length === 0 && similar.length === 0) return null;

  return (
    <div className="mt-2">
      <MediaRow title="Recommendations" items={recommendations} showReason={false} />
      <MediaRow title="Similar Titles" items={similar} showReason={false} />
    </div>
  );
}
