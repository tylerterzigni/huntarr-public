import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  addReminder,
  findReminderByKey,
  getReminder,
  hasOtherReminders,
  listReminders,
  removeReminder,
} from "@/lib/reminders";
import { primaryRelease } from "@/lib/reminders/releases";
import { getTmdbRegion } from "@/lib/settings/global";
import { parkInArr, removeParkedFromArr, resolveReminderInstance } from "@/lib/reminders/arr";
import { z } from "zod";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await listReminders(session.user.id);
  // The navbar only needs the count; the Reminders page asks for release dates too.
  if (new URL(request.url).searchParams.get("releases") !== "1") {
    return NextResponse.json({ items });
  }

  const region = await getTmdbRegion();
  const withReleases = await Promise.all(
    items.map(async (item) => ({
      ...item,
      release: await primaryRelease(item, region).catch(() => null),
    }))
  );
  return NextResponse.json({ items: withReleases });
}

const mediaTypeSchema = z.enum(["movie", "tv"]);

const addSchema = z.object({
  tmdbId: z.number(),
  mediaType: mediaTypeSchema,
  title: z.string(),
  year: z.number().int().nullable().optional(),
  posterPath: z.string().nullable().optional(),
  trailerUrl: z.string().url().nullable().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = addSchema.parse(await request.json());
  const existing = await findReminderByKey({
    userId: session.user.id,
    tmdbId: data.tmdbId,
    mediaType: data.mediaType,
  });
  if (existing) {
    return NextResponse.json({ error: "Already on reminders" }, { status: 409 });
  }

  const instance = await resolveReminderInstance(data.mediaType);
  let addedToArr = false;
  if (instance) {
    try {
      addedToArr = await parkInArr(instance, data.mediaType, data.tmdbId, data.title);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to add to Arr" },
        { status: 502 }
      );
    }
  }

  const item = await addReminder({
    userId: session.user.id,
    tmdbId: data.tmdbId,
    mediaType: data.mediaType,
    title: data.title,
    year: data.year ?? null,
    posterPath: data.posterPath ?? null,
    trailerUrl: data.trailerUrl ?? null,
    instanceId: instance?.id ?? null,
    addedToArr,
  });

  return NextResponse.json({
    item,
    arr: !instance ? "not-configured" : addedToArr ? "added" : "existing",
  });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const tmdbId = searchParams.get("tmdbId");
  const mediaType = mediaTypeSchema.safeParse(searchParams.get("mediaType"));

  const item = id
    ? await getReminder(session.user.id, id)
    : tmdbId && mediaType.success
      ? await findReminderByKey({
          userId: session.user.id,
          tmdbId: parseInt(tmdbId, 10),
          mediaType: mediaType.data,
        })
      : undefined;

  if (item === undefined) {
    return NextResponse.json({ error: "ID or tmdbId+mediaType required" }, { status: 400 });
  }
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await removeReminder(item.id);

  // Only clean up Arr entries Huntarr created, and only when no one else is waiting on them.
  let removedFromArr = false;
  let arrError: string | undefined;
  if (
    item.addedToArr &&
    !(await hasOtherReminders({
      tmdbId: item.tmdbId,
      mediaType: item.mediaType,
      excludeId: item.id,
    }))
  ) {
    try {
      const instance = await resolveReminderInstance(item.mediaType, item.instanceId);
      if (instance) {
        removedFromArr = await removeParkedFromArr(instance, item.mediaType, item.tmdbId);
      }
    } catch (err) {
      arrError = err instanceof Error ? err.message : "Failed to remove from Arr";
    }
  }

  return NextResponse.json({ success: true, removedFromArr, arrError });
}
