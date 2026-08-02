import { Suspense } from "react";
import { requireAuth } from "@/lib/auth/session";
import { MainLayout } from "@/components/layout/MainLayout";
import { getTmdbApiKey } from "@/lib/settings/global";
import { BecauseYouWatchedSection } from "@/components/home/BecauseYouWatchedSection";
import { ForYouSection } from "@/components/home/ForYouSection";
import { HomeBrowseSection } from "@/components/home/HomeBrowseSection";
import { BrowseRowsSkeleton, MediaRowSkeleton } from "@/components/home/MediaRowSkeleton";
import { WarmPersonalizeOnHome } from "@/components/home/WarmPersonalizeOnHome";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await requireAuth();
  const tmdbConfigured = Boolean(await getTmdbApiKey());

  return (
    <MainLayout username={session.user.name}>
      <div className="pt-0 pb-6 md:py-8">
        <WarmPersonalizeOnHome />
        {!tmdbConfigured && (
          <div className="mx-4 md:mx-8 mb-8 rounded-lg border border-gray-300/70 bg-white/40 p-4 text-sm text-gray-700 backdrop-blur-md">
            TMDB is not configured yet. Add your API key in{" "}
            <a href="/settings" className="underline text-gray-900 hover:text-gray-700">
              Settings → General
            </a>{" "}
            to browse movies and TV.
          </div>
        )}
        <Suspense
          fallback={
            <MediaRowSkeleton
              title="For You"
              subtitle="Personalized recommendations based on your taste"
            />
          }
        >
          <ForYouSection />
        </Suspense>
        <Suspense fallback={<MediaRowSkeleton title="Because You Watched" />}>
          <BecauseYouWatchedSection userId={session.user.id} />
        </Suspense>
        <Suspense fallback={<BrowseRowsSkeleton />}>
          <HomeBrowseSection userId={session.user.id} tmdbConfigured={tmdbConfigured} />
        </Suspense>
      </div>
    </MainLayout>
  );
}
