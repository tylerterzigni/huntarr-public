import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  integrationInstances,
  aiProviderConfigs,
  userPreferences,
} from "@/lib/db/schema";
import { encrypt, encryptJson } from "@/lib/crypto";
import { setGlobalSetting, getGlobalSetting, getTmdbRegion, getTmdbLanguage } from "@/lib/settings/global";
import { clearForYouRecommendationCache } from "@/lib/recommendations/engine";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integrations = await db.select().from(integrationInstances);
  const aiProviders = await db
    .select()
    .from(aiProviderConfigs)
    .where(eq(aiProviderConfigs.userId, session.user.id));
  const tmdbKey = await getGlobalSetting("tmdb_api_key");
  const omdbKey = await getGlobalSetting("omdb_api_key");
  const region = await getTmdbRegion();
  const language = await getTmdbLanguage();

  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, session.user.id))
    .limit(1);

  return NextResponse.json({
    general: {
      tmdbConfigured: !!tmdbKey,
      omdbConfigured: !!omdbKey,
      region,
      language,
    },
    integrations: integrations.map((i) => ({
      id: i.id,
      type: i.type,
      name: i.name,
      baseUrl: i.baseUrl,
      isDefault: i.isDefault,
      enabled: i.enabled,
      config: i.config,
      hasCredentials: !!i.encryptedCredentials,
    })),
    aiProviders: aiProviders.map((p) => ({
      id: p.id,
      provider: p.provider,
      name: p.name,
      model: p.model,
      priority: p.priority,
      enabled: p.enabled,
      baseUrl: p.baseUrl,
      hasApiKey: !!p.encryptedApiKey,
    })),
    preferences: prefs ?? null,
    userRole: session.user.role,
  });
}

const generalSchema = z.object({
  tmdbApiKey: z.string().optional(),
  omdbApiKey: z.string().optional(),
  region: z.string().optional(),
  language: z.string().optional(),
});

const integrationSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(["radarr", "sonarr", "plex", "tautulli"]),
  name: z.string().min(1),
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  token: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  isDefault: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

const aiSchema = z.object({
  id: z.string().uuid().optional(),
  provider: z.enum(["openrouter", "openai", "anthropic", "ollama"]),
  name: z.string().min(1),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional().or(z.literal("")),
  model: z.string().min(1),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
});

const preferencesSchema = z.object({
  tautulliUsernames: z.array(z.string()).optional(),
  recommendationWeights: z.record(z.number()).optional(),
});

const recommendationsSchema = z.object({
  keywords: z.array(z.string().trim().min(1).max(80)).max(20),
});

const putBodySchema = z.object({
  section: z.enum(["general", "integration", "ai", "preferences", "recommendations"]),
  data: z.unknown(),
});

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = putBodySchema.parse(await request.json());
  const section = body.section;

  if (section === "general") {
    const data = generalSchema.parse(body.data);
    if (data.tmdbApiKey) await setGlobalSetting("tmdb_api_key", data.tmdbApiKey, true);
    if (data.omdbApiKey) await setGlobalSetting("omdb_api_key", data.omdbApiKey, true);
    if (data.region) await setGlobalSetting("tmdb_region", data.region);
    if (data.language) await setGlobalSetting("tmdb_language", data.language);
    return NextResponse.json({ success: true });
  }

  if (section === "integration") {
    const data = integrationSchema.parse(body.data);

    if (data.type === "plex" && /app\.plex\.tv|plex\.tv\/desktop|watch\.plex\.tv/i.test(data.baseUrl)) {
      return NextResponse.json(
        {
          error:
            "Use your Plex Media Server URL (e.g. http://192.168.x.x:32400), not app.plex.tv. Huntarr can also auto-discover the server from your token when syncing.",
        },
        { status: 400 }
      );
    }

    const credentials = data.apiKey
      ? encryptJson({ apiKey: data.apiKey })
      : data.token
        ? encryptJson({ token: data.token })
        : undefined;

    if (data.id) {
      const update: Record<string, unknown> = {
        name: data.name,
        baseUrl: data.baseUrl,
        config: data.config ?? {},
        isDefault: data.isDefault ?? false,
        enabled: data.enabled ?? true,
        updatedAt: new Date(),
      };
      if (credentials) update.encryptedCredentials = credentials;

      await db
        .update(integrationInstances)
        .set(update)
        .where(eq(integrationInstances.id, data.id));
    } else {
      if (!credentials) {
        return NextResponse.json({ error: "API key or token required" }, { status: 400 });
      }
      await db.insert(integrationInstances).values({
        type: data.type,
        name: data.name,
        baseUrl: data.baseUrl,
        encryptedCredentials: credentials,
        config: data.config ?? {},
        isDefault: data.isDefault ?? false,
        enabled: data.enabled ?? true,
      });
    }
    return NextResponse.json({ success: true });
  }

  if (section === "ai") {
    const data = aiSchema.parse(body.data);
    const userId = session.user.id;

    const values = {
      provider: data.provider,
      name: data.name,
      model: data.model,
      baseUrl: data.baseUrl || null,
      priority: data.priority ?? 0,
      enabled: data.enabled ?? true,
      encryptedApiKey: data.apiKey ? encrypt(data.apiKey) : undefined,
    };

    if (data.id) {
      const update = { ...values };
      if (!data.apiKey) delete update.encryptedApiKey;
      const updated = await db
        .update(aiProviderConfigs)
        .set(update)
        .where(and(eq(aiProviderConfigs.id, data.id), eq(aiProviderConfigs.userId, userId)))
        .returning({ id: aiProviderConfigs.id });
      if (updated.length === 0) {
        return NextResponse.json({ error: "AI provider not found" }, { status: 404 });
      }
    } else {
      await db.insert(aiProviderConfigs).values({
        ...values,
        userId,
        encryptedApiKey: values.encryptedApiKey ?? null,
      });
    }
    return NextResponse.json({ success: true });
  }

  if (section === "preferences") {
    const data = preferencesSchema.parse(body.data);
    await db
      .update(userPreferences)
      .set({
        tautulliUsernames: data.tautulliUsernames,
        recommendationWeights: data.recommendationWeights,
        updatedAt: new Date(),
      })
      .where(eq(userPreferences.userId, session.user.id));

    return NextResponse.json({ success: true });
  }

  if (section === "recommendations") {
    const data = recommendationsSchema.parse(body.data);
    const keywords = [...new Set(data.keywords.map((k) => k.trim()).filter(Boolean))];

    await db
      .update(userPreferences)
      .set({
        recommendationKeywords: keywords,
        updatedAt: new Date(),
      })
      .where(eq(userPreferences.userId, session.user.id));

    clearForYouRecommendationCache(session.user.id);

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown section" }, { status: 400 });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const id = searchParams.get("id");

  if (type === "integration" && id) {
    await db.delete(integrationInstances).where(eq(integrationInstances.id, id));
    return NextResponse.json({ success: true });
  }

  if (type === "ai" && id) {
    const deleted = await db
      .delete(aiProviderConfigs)
      .where(and(eq(aiProviderConfigs.id, id), eq(aiProviderConfigs.userId, session.user.id)))
      .returning({ id: aiProviderConfigs.id });
    if (deleted.length === 0) {
      return NextResponse.json({ error: "AI provider not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
