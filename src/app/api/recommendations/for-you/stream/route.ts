import { auth } from "@/lib/auth";
import { HOME_ROW_LIMIT } from "@/lib/recommendations/constants";
import { streamForYouRecommendations } from "@/lib/recommendations/engine";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "1";
  const refreshCount = Math.max(0, Number.parseInt(searchParams.get("recency") ?? "0", 10) || 0);
  const refreshGeneration = Math.max(0, Number.parseInt(searchParams.get("gen") ?? "0", 10) || 0);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: { items: unknown[]; done: boolean }) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        await streamForYouRecommendations(
          session.user.id,
          { refresh, limit: HOME_ROW_LIMIT, refreshCount, refreshGeneration },
          send
        );
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
    },
  });
}
