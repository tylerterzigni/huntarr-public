import { Suspense } from "react";
import { MediaRow } from "@/components/media/MediaRow";
import { PersonalizedBrowseRow } from "@/components/home/PersonalizedBrowseRow";
import { BecauseYouWatchedSection } from "@/components/home/BecauseYouWatchedSection";
import { ForYouSection } from "@/components/home/ForYouSection";
import { MediaRowSkeleton } from "@/components/home/MediaRowSkeleton";
import { getHomeBrowseData } from "@/lib/home/browse-data";
import {
  HOME_ROW_LABELS,
  type HomeRowId,
} from "@/lib/home/row-order";

const BROWSE_DEFAULT_ORDER_LABEL: Partial<Record<HomeRowId, string>> = {
  trending: "global trending",
  "popular-tv": "popularity",
  "upcoming-tv": "popularity",
  "popular-movies": "popularity",
  "upcoming-movies": "popularity",
};

async function HomeBrowseRow({
  rowId,
  userId,
  tmdbConfigured,
  showEmptyHint,
}: {
  rowId: HomeRowId;
  userId: string;
  tmdbConfigured: boolean;
  showEmptyHint: boolean;
}) {
  const data = await getHomeBrowseData(userId, tmdbConfigured);

  const emptyHint =
    showEmptyHint && tmdbConfigured && !data.hasBrowseData && data.recentRequestCount === 0 ? (
      <div className="mx-4 md:mx-8 mb-8 rounded-lg border border-gray-300/70 bg-white/40 p-4 text-sm text-muted-foreground backdrop-blur-md">
        No browse data available yet. Configure TMDB and sync Tautulli history for personalized
        rows.
      </div>
    ) : null;

  if (rowId === "recent-requests") {
    return (
      <>
        {emptyHint}
        <MediaRow
          title={HOME_ROW_LABELS[rowId]}
          items={data.recentRequests}
          showReason={false}
          applyVisibilityFilter={false}
        />
      </>
    );
  }

  const items =
    rowId === "trending"
      ? data.trending
      : rowId === "popular-tv"
        ? data.popularTv
        : rowId === "upcoming-tv"
          ? data.upcomingTv
          : rowId === "popular-movies"
            ? data.popularMovies
            : data.upcomingMovies;

  return (
    <>
      {emptyHint}
      <PersonalizedBrowseRow
        title={HOME_ROW_LABELS[rowId]}
        initialItems={items}
        defaultOrderLabel={BROWSE_DEFAULT_ORDER_LABEL[rowId] ?? "popularity"}
      />
    </>
  );
}

function HomeRowSuspense({
  rowId,
  userId,
  tmdbConfigured,
  showEmptyHint,
}: {
  rowId: HomeRowId;
  userId: string;
  tmdbConfigured: boolean;
  showEmptyHint: boolean;
}) {
  if (rowId === "for-you") {
    return (
      <Suspense
        fallback={
          <MediaRowSkeleton
            title={HOME_ROW_LABELS[rowId]}
            subtitle="Personalized recommendations based on your taste"
          />
        }
      >
        <ForYouSection />
      </Suspense>
    );
  }

  if (rowId === "because-you-watched") {
    return (
      <Suspense fallback={<MediaRowSkeleton title={HOME_ROW_LABELS[rowId]} />}>
        <BecauseYouWatchedSection userId={userId} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<MediaRowSkeleton title={HOME_ROW_LABELS[rowId]} />}>
      <HomeBrowseRow
        rowId={rowId}
        userId={userId}
        tmdbConfigured={tmdbConfigured}
        showEmptyHint={showEmptyHint}
      />
    </Suspense>
  );
}

interface OrderedHomeRowsProps {
  userId: string;
  tmdbConfigured: boolean;
  order: HomeRowId[];
}

export function OrderedHomeRows({ userId, tmdbConfigured, order }: OrderedHomeRowsProps) {
  const firstBrowseIndex = order.findIndex(
    (id) => id !== "for-you" && id !== "because-you-watched"
  );

  return (
    <>
      {order.map((rowId, index) => (
        <HomeRowSuspense
          key={rowId}
          rowId={rowId}
          userId={userId}
          tmdbConfigured={tmdbConfigured}
          showEmptyHint={index === firstBrowseIndex}
        />
      ))}
    </>
  );
}
