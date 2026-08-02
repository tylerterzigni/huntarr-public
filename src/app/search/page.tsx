import { requireAuth } from "@/lib/auth/session";
import { MainLayout } from "@/components/layout/MainLayout";
import { SearchPageBody } from "@/components/search/SearchPageBody";
import { runSearch } from "@/lib/search/run-search";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: PageProps) {
  const session = await requireAuth();
  const params = await searchParams;
  const query = params.q?.trim() ?? "";

  let initialItems: Awaited<ReturnType<typeof runSearch>>["results"] = [];
  let initialPeople: Awaited<ReturnType<typeof runSearch>>["people"] = [];
  let totalPages = 1;

  if (query) {
    try {
      const data = await runSearch(session.user.id, query, { page: 1 });
      initialItems = data.results;
      initialPeople = data.people;
      totalPages = data.total_pages;
    } catch {
      // TMDB search failed
    }
  }

  return (
    <MainLayout username={session.user.name}>
      <SearchPageBody
        key={query}
        query={query}
        initialItems={initialItems}
        initialPeople={initialPeople}
        totalPages={totalPages}
      />
    </MainLayout>
  );
}
