import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { plexLibraryCache } from "@/lib/db/schema";
import {
  buildPlexWebPlayUrl,
  fetchPlexMachineIdentifier,
} from "@/lib/integrations/plex/client";
import { getGlobalSetting, setGlobalSetting } from "@/lib/settings/global";
import { getDecryptedPlexInstance } from "@/lib/settings/integrations";
import type { MediaType } from "@/types";

const PLEX_MACHINE_ID_KEY = "plex_machine_identifier";

function plexSearchUrl(title: string): string {
  return `https://app.plex.tv/desktop/#!/search?query=${encodeURIComponent(title)}`;
}

async function getPlexMachineIdentifier(): Promise<string | null> {
  let machineId = await getGlobalSetting(PLEX_MACHINE_ID_KEY);
  if (machineId) return machineId;

  const instance = await getDecryptedPlexInstance();
  if (!instance) return null;

  machineId = await fetchPlexMachineIdentifier(instance);
  if (machineId) {
    await setGlobalSetting(PLEX_MACHINE_ID_KEY, machineId);
  }
  return machineId;
}

export async function getPlexPlayUrl(
  tmdbId: number,
  mediaType: MediaType,
  title: string
): Promise<string> {
  const [row] = await db
    .select({ plexRatingKey: plexLibraryCache.plexRatingKey })
    .from(plexLibraryCache)
    .where(and(eq(plexLibraryCache.tmdbId, tmdbId), eq(plexLibraryCache.mediaType, mediaType)))
    .limit(1);

  if (!row?.plexRatingKey) {
    return plexSearchUrl(title);
  }

  const machineId = await getPlexMachineIdentifier();
  if (!machineId) {
    return plexSearchUrl(title);
  }

  return buildPlexWebPlayUrl(machineId, row.plexRatingKey);
}
