import { BecauseYouWatchedRow } from "@/components/media/BecauseYouWatchedRow";
import { getBecauseYouWatched } from "@/lib/recommendations/engine";
import { HOME_ROW_LIMIT } from "@/lib/recommendations/constants";

export async function BecauseYouWatchedSection({ userId }: { userId: string }) {
  const becauseYouWatched = await getBecauseYouWatched(userId, {
    limit: HOME_ROW_LIMIT,
  }).catch(() => null);

  if (!becauseYouWatched) return null;

  return (
    <BecauseYouWatchedRow
      initialSeedTitle={becauseYouWatched.seedTitle}
      initialSeedIndex={becauseYouWatched.seedIndex}
      seedCount={becauseYouWatched.seedCount}
      initialItems={becauseYouWatched.items}
    />
  );
}
