import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getForYouRecommendations, getBecauseYouWatched } from "@/lib/recommendations/engine";
import { HOME_ROW_LIMIT } from "@/lib/recommendations/constants";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  try {
    if (type === "for-you") {
      const refresh = searchParams.get("refresh") === "1";
      const refreshCount = Math.max(
        0,
        Number.parseInt(searchParams.get("recency") ?? "0", 10) || 0
      );
      const refreshGeneration = Math.max(
        0,
        Number.parseInt(searchParams.get("gen") ?? "0", 10) || 0
      );
      const items = await getForYouRecommendations(
        session.user.id,
        {},
        { limit: HOME_ROW_LIMIT, refresh, refreshCount, refreshGeneration }
      );
      return NextResponse.json({ items });
    }

    if (type === "because-you-watched") {
      const seedParam = searchParams.get("seedIndex");
      const seedIndex = seedParam != null ? parseInt(seedParam, 10) : undefined;
      const seedTmdbParam = searchParams.get("seedTmdbId");
      const seedTmdbId = seedTmdbParam != null ? parseInt(seedTmdbParam, 10) : undefined;
      const seedMediaType = searchParams.get("seedMediaType");
      const result = await getBecauseYouWatched(session.user.id, {
        seedIndex: Number.isFinite(seedIndex) ? seedIndex : undefined,
        seedTmdbId: Number.isFinite(seedTmdbId) ? seedTmdbId : undefined,
        seedMediaType:
          seedMediaType === "movie" || seedMediaType === "tv" ? seedMediaType : undefined,
        limit: HOME_ROW_LIMIT,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "type required" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
