import { z } from "zod";
import { auth } from "@/lib/auth";
import { DISCOVER_PERSONALIZE_MAX } from "@/lib/recommendations/constants";
import {
  streamPersonalizeBrowseItems,
  type PersonalizeBrowseStreamEvent,
} from "@/lib/recommendations/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response("Invalid body", { status: 400 });
  }

  const items = parsed.data.items
    .filter((item) => Number.isFinite(item.id))
    .slice(0, DISCOVER_PERSONALIZE_MAX);
  if (items.length === 0) {
    return new Response("Invalid body", { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: PersonalizeBrowseStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        await streamPersonalizeBrowseItems(session.user!.id, items, send);
      } catch {
        send({ items: [], done: true });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
