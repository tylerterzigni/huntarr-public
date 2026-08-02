import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  addToHideList,
  hideEntryExists,
  listHideItems,
  removeFromHideList,
} from "@/lib/hide-list";
import { clearForYouRecommendationCache } from "@/lib/recommendations/engine";
import { z } from "zod";

function invalidateBrowseAfterHideChange(scope: "global" | "user", userId: string) {
  // Liked-list already clears For You cache; hide must too or cached rows reappear on refresh.
  if (scope === "global") {
    clearForYouRecommendationCache();
  } else {
    clearForYouRecommendationCache(userId);
  }
  revalidatePath("/");
  revalidatePath("/movies");
  revalidatePath("/tv");
  revalidatePath("/discover");
  revalidatePath("/search");
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await listHideItems(session.user.id);
  return NextResponse.json({ items });
}

const addSchema = z.object({
  tmdbId: z.number(),
  mediaType: z.enum(["movie", "tv"]),
  title: z.string(),
  scope: z.enum(["global", "user"]),
  reason: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const data = addSchema.parse(body);

  if (data.scope === "global" && session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin required for global hide list" }, { status: 403 });
  }

  const exists = await hideEntryExists({
    tmdbId: data.tmdbId,
    mediaType: data.mediaType,
    scope: data.scope,
    userId: session.user.id,
  });
  if (exists) {
    // Still invalidate — client may have stale For You / browse caches.
    invalidateBrowseAfterHideChange(data.scope, session.user.id);
    return NextResponse.json({ error: "Title already on hide list" }, { status: 409 });
  }

  const [item] = await addToHideList({
    ...data,
    userId: session.user.id,
  });

  invalidateBrowseAfterHideChange(data.scope, session.user.id);
  return NextResponse.json({ item });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  const items = await listHideItems(session.user.id);
  const item = items.find((i) => i.id === id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (item.scope === "global" && session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin required to remove global hide" }, { status: 403 });
  }

  await removeFromHideList(id);
  invalidateBrowseAfterHideChange(item.scope, session.user.id);
  return NextResponse.json({ success: true });
}
