import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { integrationInstances } from "@/lib/db/schema";
import { decryptJson } from "@/lib/crypto";
import type { ArrCredentials, IntegrationConfig, PlexCredentials, TautulliCredentials } from "@/types";

export async function getIntegrationInstances(type?: "radarr" | "sonarr" | "plex" | "tautulli") {
  const rows = type
    ? await db.select().from(integrationInstances).where(eq(integrationInstances.type, type))
    : await db.select().from(integrationInstances);

  return rows.filter((r) => r.enabled);
}

export async function getIntegrationById(id: string) {
  const [row] = await db
    .select()
    .from(integrationInstances)
    .where(eq(integrationInstances.id, id))
    .limit(1);
  return row ?? null;
}

export function getCredentials<T>(instance: typeof integrationInstances.$inferSelect): T {
  return decryptJson<T>(instance.encryptedCredentials);
}

export async function getDefaultInstance(type: "radarr" | "sonarr" | "plex" | "tautulli") {
  const instances = await getIntegrationInstances(type);
  return instances.find((i) => i.isDefault) ?? instances[0] ?? null;
}

export function getInstanceConfig(instance: typeof integrationInstances.$inferSelect): IntegrationConfig {
  return (instance.config as IntegrationConfig) ?? {};
}

export type DecryptedInstance<T> = {
  id: string;
  name: string;
  baseUrl: string;
  credentials: T;
  config: IntegrationConfig;
  isDefault: boolean;
};

export async function getDecryptedArrInstance(id: string): Promise<DecryptedInstance<ArrCredentials> | null> {
  const instance = await getIntegrationById(id);
  if (!instance || (instance.type !== "radarr" && instance.type !== "sonarr")) return null;
  return {
    id: instance.id,
    name: instance.name,
    baseUrl: instance.baseUrl.replace(/\/$/, ""),
    credentials: getCredentials<ArrCredentials>(instance),
    config: getInstanceConfig(instance),
    isDefault: instance.isDefault,
  };
}

export async function getDecryptedPlexInstance(): Promise<DecryptedInstance<PlexCredentials> | null> {
  const instance = await getDefaultInstance("plex");
  if (!instance) return null;
  return {
    id: instance.id,
    name: instance.name,
    baseUrl: instance.baseUrl.replace(/\/$/, ""),
    credentials: getCredentials<PlexCredentials>(instance),
    config: getInstanceConfig(instance),
    isDefault: instance.isDefault,
  };
}

export async function getDecryptedTautulliInstance(): Promise<DecryptedInstance<TautulliCredentials> | null> {
  const instance = await getDefaultInstance("tautulli");
  if (!instance) return null;
  return {
    id: instance.id,
    name: instance.name,
    baseUrl: instance.baseUrl.replace(/\/$/, ""),
    credentials: getCredentials<TautulliCredentials>(instance),
    config: getInstanceConfig(instance),
    isDefault: instance.isDefault,
  };
}
