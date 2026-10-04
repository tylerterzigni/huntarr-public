import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { arrRequestsLog } from "@/lib/db/schema";
import { getReminder, removeReminder } from "@/lib/reminders";
import { activateInArr, resolveReminderInstance } from "@/lib/reminders/arr";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Turn on monitoring + start a search in Radarr/Sonarr, then drop the reminder. */
export async function POST(_request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const item = await getReminder(session.user.id, id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const instance = await resolveReminderInstance(item.mediaType, item.instanceId);
  if (!instance) {
    const service = item.mediaType === "movie" ? "Radarr" : "Sonarr";
    return NextResponse.json(
      { error: `No ${service} instance configured in Settings` },
      { status: 400 }
    );
  }

  try {
    await activateInArr(instance, item.mediaType, item.tmdbId, item.title);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start search" },
      { status: 502 }
    );
  }

  await db.insert(arrRequestsLog).values({
    userId: session.user.id,
    instanceId: instance.id,
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    status: "added",
  });
  await removeReminder(item.id);

  return NextResponse.json({ success: true });
}
