import { auth } from "@/lib/auth";
import { warmPersonalizeBrowseContext } from "@/lib/recommendations/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  await warmPersonalizeBrowseContext(session.user.id);
  return Response.json({ ok: true });
}
