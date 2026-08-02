import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { globalSettings } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";

export async function getGlobalSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(globalSettings)
    .where(eq(globalSettings.key, key))
    .limit(1);

  if (!row) return null;
  if (row.plainValue) return row.plainValue;
  if (row.encryptedValue) return decrypt(row.encryptedValue);
  return null;
}

export async function setGlobalSetting(
  key: string,
  value: string,
  encryptValue = false
) {
  const existing = await db
    .select()
    .from(globalSettings)
    .where(eq(globalSettings.key, key))
    .limit(1);

  const data = encryptValue
    ? { encryptedValue: encrypt(value), plainValue: null }
    : { plainValue: value, encryptedValue: null };

  if (existing.length > 0) {
    await db
      .update(globalSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(globalSettings.key, key));
  } else {
    await db.insert(globalSettings).values({ key, ...data });
  }
}

export async function getTmdbApiKey(): Promise<string | null> {
  return getGlobalSetting("tmdb_api_key");
}

export async function getTmdbRegion(): Promise<string> {
  return (await getGlobalSetting("tmdb_region")) ?? "US";
}

export async function getTmdbLanguage(): Promise<string> {
  return (await getGlobalSetting("tmdb_language")) ?? "en-US";
}

export async function getOmdbApiKey(): Promise<string | null> {
  return getGlobalSetting("omdb_api_key");
}
