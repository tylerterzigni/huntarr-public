import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runSearch, runSearchPreview } from "@/lib/search/run-search";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "Query required" }, { status: 400 });
  }

  const pages = searchParams.get("pages");
  const page = searchParams.get("page");
  const preview = searchParams.get("preview") === "1";

  try {
    if (preview) {
      const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);
      const limitRaw = Number(searchParams.get("limit") ?? 6);
      const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 6), 30);
      const data = await runSearchPreview(session.user.id, q, { offset, limit });
      return NextResponse.json({ preview: data.items, hasMore: data.hasMore });
    }

    const data = await runSearch(session.user.id, q, {
      pages: pages ? Number(pages) : undefined,
      page: page ? Number(page) : undefined,
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
}
