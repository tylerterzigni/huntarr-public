import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { personalizeBrowseItems } from "@/lib/recommendations/engine";
import { DISCOVER_PERSONALIZE_MAX } from "@/lib/recommendations/constants";

const browseItemSchema = z
  .object({
    id: z.coerce.number().finite(),
  })
  .passthrough();

const bodySchema = z.object({
  items: z.array(browseItemSchema).min(1),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const items = parsed.data.items
    .filter((item) => Number.isFinite(item.id))
    .slice(0, DISCOVER_PERSONALIZE_MAX);
  if (items.length === 0) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const ranked = await personalizeBrowseItems(session.user.id, items);
    return NextResponse.json({ items: ranked });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to personalize browse row" },
      { status: 500 }
    );
  }
}
