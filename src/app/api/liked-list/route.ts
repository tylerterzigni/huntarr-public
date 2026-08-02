import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  addToLikedList,
  likedEntryExists,
  listLikedItems,
  removeFromLikedList,
  removeLikedByKey,
} from "@/lib/liked-list";
import { clearForYouRecommendationCache } from "@/lib/recommendations/engine";
import { z } from "zod";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await listLikedItems(session.user.id);
  return NextResponse.json({ items });
}

const addSchema = z.object({
  tmdbId: z.number(),
  kind: z.enum(["movie", "tv", "person"]),
  title: z.string(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const data = addSchema.parse(body);

  const exists = await likedEntryExists({
    userId: session.user.id,
    tmdbId: data.tmdbId,
    kind: data.kind,
  });
  if (exists) {
    return NextResponse.json({ error: "Already liked" }, { status: 409 });
  }

  const [item] = await addToLikedList({
    userId: session.user.id,
    tmdbId: data.tmdbId,
    kind: data.kind,
    title: data.title,
  });

  clearForYouRecommendationCache(session.user.id);
  return NextResponse.json({ item });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const tmdbId = searchParams.get("tmdbId");
  const kind = searchParams.get("kind");

  if (id) {
    const items = await listLikedItems(session.user.id);
    const item = items.find((i) => i.id === id);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await removeFromLikedList(id);
  } else if (tmdbId && kind) {
    const parsedKind = addSchema.shape.kind.safeParse(kind);
    if (!parsedKind.success) {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }
    await removeLikedByKey({
      userId: session.user.id,
      tmdbId: parseInt(tmdbId, 10),
      kind: parsedKind.data,
    });
  } else {
    return NextResponse.json({ error: "ID or tmdbId+kind required" }, { status: 400 });
  }

  clearForYouRecommendationCache(session.user.id);
  return NextResponse.json({ success: true });
}
