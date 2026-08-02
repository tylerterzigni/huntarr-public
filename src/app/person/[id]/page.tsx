import Image from "next/image";
import { requireAuth } from "@/lib/auth/session";
import { MainLayout } from "@/components/layout/MainLayout";
import { getPersonDetails } from "@/lib/integrations/tmdb/client";
import { MediaRow } from "@/components/media/MediaRow";
import { LikeButton } from "@/components/media/LikeButton";
import { isLiked } from "@/lib/liked-list";
import { profileUrl } from "@/lib/utils";
import type { TmdbMediaItem } from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface CombinedCredit extends TmdbMediaItem {
  character?: string;
  job?: string;
  media_type?: "movie" | "tv";
}

function sortCreditsByDate(items: CombinedCredit[]) {
  return [...items].sort((a, b) => {
    const dateA = a.release_date ?? a.first_air_date ?? "";
    const dateB = b.release_date ?? b.first_air_date ?? "";
    return dateB.localeCompare(dateA);
  });
}

function dedupeCredits(items: CombinedCredit[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const mediaType = item.media_type ?? (item.title ? "movie" : "tv");
    const key = `${mediaType}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default async function PersonPage({ params }: PageProps) {
  const session = await requireAuth();
  const { id } = await params;
  const personId = parseInt(id, 10);

  let details: Record<string, unknown> = {};
  try {
    details = await getPersonDetails(personId);
  } catch {
    return (
      <MainLayout username={session.user.name}>
        <div className="p-8 text-center">Person not found or TMDB not configured.</div>
      </MainLayout>
    );
  }

  const name = (details.name as string) ?? "Unknown";
  const biography = details.biography as string | undefined;
  const knownForDepartment = details.known_for_department as string | undefined;
  const personLiked = await isLiked(personId, "person", session.user.id);
  const combinedCredits = details.combined_credits as
    | { cast?: CombinedCredit[]; crew?: CombinedCredit[] }
    | undefined;

  const movieCredits = dedupeCredits(
    sortCreditsByDate(
      [
        ...(combinedCredits?.cast?.filter((item) => item.media_type === "movie") ?? []),
        ...(combinedCredits?.crew?.filter((item) => item.media_type === "movie") ?? []),
      ].map((item) => ({ ...item, media_type: "movie" as const }))
    )
  );

  const tvCredits = dedupeCredits(
    sortCreditsByDate(
      [
        ...(combinedCredits?.cast?.filter((item) => item.media_type === "tv") ?? []),
        ...(combinedCredits?.crew?.filter((item) => item.media_type === "tv") ?? []),
      ].map((item) => ({ ...item, media_type: "tv" as const }))
    )
  );

  return (
    <MainLayout username={session.user.name}>
      <div className="px-4 md:px-8 pt-10 pb-12">
        <div className="flex flex-col md:flex-row gap-8 mb-10">
          <div className="relative w-[200px] flex-shrink-0 mx-auto md:mx-0">
            <Image
              src={profileUrl(details.profile_path as string | null, "w342")}
              alt={name}
              width={200}
              height={300}
              className="rounded-lg shadow-2xl object-cover aspect-[2/3]"
            />
          </div>
          <div className="flex-1">
            <h1 className="text-3xl md:text-4xl font-bold">{name}</h1>
            {knownForDepartment && (
              <p className="mt-2 text-sm text-muted-foreground">{knownForDepartment}</p>
            )}
            <div className="mt-4">
              <LikeButton
                tmdbId={personId}
                kind="person"
                title={name}
                initialLiked={personLiked}
              />
            </div>
            {biography && (
              <p className="mt-4 text-gray-700 leading-relaxed max-w-3xl line-clamp-[12]">
                {biography}
              </p>
            )}
          </div>
        </div>
        <MediaRow title="Movies" items={movieCredits} />
        <MediaRow title="TV Shows" items={tvCredits} />
      </div>
    </MainLayout>
  );
}
