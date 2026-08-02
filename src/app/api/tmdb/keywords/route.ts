import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchKeyword } from "@/lib/integrations/tmdb/client";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  if (!query) {
    return NextResponse.json({ results: [] });
  }

  try {
    const data = await searchKeyword(query);
    return NextResponse.json({ results: data.results.slice(0, 8) });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
