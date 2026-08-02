import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTvSeason } from "@/lib/integrations/tmdb/client";

interface RouteParams {
  params: Promise<{ id: string; seasonNumber: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, seasonNumber } = await params;
  const tvId = parseInt(id, 10);
  const season = parseInt(seasonNumber, 10);

  if (!Number.isFinite(tvId) || !Number.isFinite(season)) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  try {
    const data = await getTvSeason(tvId, season);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Season not found" }, { status: 404 });
  }
}
