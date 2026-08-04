import { and, eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiProviderConfigs } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto";
import {
  buildContextualChatReply,
  hasDeterministicSearchIntent,
  parseChatAIResponse,
  resolveChatCriteriaFromMessage,
} from "@/lib/ai/parse-chat-response";

export type PreferAIProvider = "openrouter" | "anthropic";

export interface AIProvider {
  id: string;
  provider: "openrouter" | "openai" | "anthropic" | "ollama";
  name: string;
  apiKey?: string;
  baseUrl?: string;
  model: string;
}

export async function getEnabledAIProviders(userId: string): Promise<AIProvider[]> {
  const rows = await db
    .select()
    .from(aiProviderConfigs)
    .where(and(eq(aiProviderConfigs.userId, userId), eq(aiProviderConfigs.enabled, true)))
    .orderBy(asc(aiProviderConfigs.priority));

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    name: row.name,
    apiKey: row.encryptedApiKey ? decrypt(row.encryptedApiKey) : undefined,
    baseUrl: row.baseUrl ?? undefined,
    model: row.model,
  }));
}

export async function hasAIProvider(
  userId: string,
  kind: PreferAIProvider
): Promise<boolean> {
  const providers = await getEnabledAIProviders(userId);
  return providers.some((p) => p.provider === kind);
}

export async function getAIProviderById(
  userId: string,
  id: string
): Promise<AIProvider | null> {
  const [row] = await db
    .select()
    .from(aiProviderConfigs)
    .where(and(eq(aiProviderConfigs.userId, userId), eq(aiProviderConfigs.id, id)))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    apiKey: row.encryptedApiKey ? decrypt(row.encryptedApiKey) : undefined,
    baseUrl: row.baseUrl ?? undefined,
    model: row.model,
  };
}

/** Validates a saved AI provider key/endpoint and configured model when possible. OpenAI/OpenRouter check the models list; Anthropic uses a 1-token ping; Ollama checks /api/tags. */
export async function testAIConnection(provider: AIProvider): Promise<void> {
  if (provider.provider === "ollama") {
    const base = (provider.baseUrl ?? "http://host.docker.internal:11434").replace(/\/$/, "");
    const res = await fetch(`${base}/api/tags`);
    if (!res.ok) throw new Error(`Ollama error: ${await res.text()}`);
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    const names = (data.models ?? []).map((m) => m.name);
    const modelOk = names.some(
      (n) => n === provider.model || n.startsWith(`${provider.model}:`)
    );
    if (provider.model && names.length > 0 && !modelOk) {
      throw new Error(`Model "${provider.model}" not found on Ollama`);
    }
    return;
  }

  if (!provider.apiKey) {
    throw new Error("API key not configured");
  }

  const { headers } = getProviderEndpoint(provider);

  if (provider.provider === "openai" || provider.provider === "openrouter") {
    const modelsUrl =
      provider.provider === "openai"
        ? "https://api.openai.com/v1/models"
        : "https://openrouter.ai/api/v1/models";
    const res = await fetch(modelsUrl, { headers });
    if (!res.ok) throw new Error(`${provider.provider} error: ${await res.text()}`);

    const configuredModel = provider.model?.trim();
    if (configuredModel) {
      const data = (await res.json()) as { data?: Array<{ id?: string }> };
      const ids = (data.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      if (ids.length > 0 && !ids.includes(configuredModel)) {
        throw new Error(
          `Model "${configuredModel}" not found on ${provider.provider === "openrouter" ? "OpenRouter" : "OpenAI"}`
        );
      }
    }
    return;
  }

  if (provider.provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic error: ${await res.text()}`);
    return;
  }

  throw new Error(`Unknown provider: ${provider.provider}`);
}

function getProviderEndpoint(provider: AIProvider): { url: string; headers: Record<string, string> } {
  switch (provider.provider) {
    case "openrouter":
      return {
        url: "https://openrouter.ai/api/v1/chat/completions",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "HTTP-Referer": process.env.AUTH_URL ?? "http://localhost:3000",
          "X-Title": "Huntarr",
        },
      };
    case "openai":
      return {
        url: "https://api.openai.com/v1/chat/completions",
        headers: { Authorization: `Bearer ${provider.apiKey}` },
      };
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/messages",
        headers: {
          "x-api-key": provider.apiKey ?? "",
          "anthropic-version": "2023-06-01",
        },
      };
    case "ollama":
      return {
        url: `${provider.baseUrl ?? "http://host.docker.internal:11434"}/api/chat`,
        headers: {},
      };
    default:
      throw new Error(`Unknown provider: ${provider.provider}`);
  }
}

function orderProviders(
  providers: AIProvider[],
  preferProvider?: PreferAIProvider,
  allowAnthropic = false
): AIProvider[] {
  const filtered = allowAnthropic
    ? providers
    : providers.filter((p) => p.provider !== "anthropic");

  if (!preferProvider) return filtered;
  return [
    ...filtered.filter((p) => p.provider === preferProvider),
    ...filtered.filter((p) => p.provider !== preferProvider),
  ];
}

export async function chatCompletion(
  userId: string,
  messages: Array<{ role: string; content: string }>,
  options: {
    temperature?: number;
    jsonMode?: boolean;
    preferOpenRouter?: boolean;
    preferProvider?: PreferAIProvider;
    /** Anthropic is chat-only. Default false so rerank/other paths never use Claude. */
    allowAnthropic?: boolean;
  } = {}
): Promise<string> {
  const preferProvider =
    options.preferProvider ??
    (options.preferOpenRouter ? "openrouter" : undefined);
  const allowAnthropic =
    options.allowAnthropic === true || preferProvider === "anthropic";

  const providers = orderProviders(
    await getEnabledAIProviders(userId),
    preferProvider,
    allowAnthropic
  );
  if (providers.length === 0) {
    throw new Error("No AI provider configured");
  }

  let lastError: Error | null = null;

  for (const provider of providers) {
    try {
      return await callProvider(provider, messages, options);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("All AI providers failed");
}

async function callProvider(
  provider: AIProvider,
  messages: Array<{ role: string; content: string }>,
  options: { temperature?: number; jsonMode?: boolean }
): Promise<string> {
  const { url, headers } = getProviderEndpoint(provider);

  if (provider.provider === "anthropic") {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 1024,
        messages: messages.filter((m) => m.role !== "system").map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
        system: messages.find((m) => m.role === "system")?.content,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic error: ${await res.text()}`);
    const data = await res.json();
    return data.content?.[0]?.text ?? "";
  }

  if (provider.provider === "ollama") {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.model,
        messages,
        stream: false,
        format: options.jsonMode ? "json" : undefined,
      }),
    });
    if (!res.ok) throw new Error(`Ollama error: ${await res.text()}`);
    const data = await res.json();
    return data.message?.content ?? "";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: 1024,
      response_format: options.jsonMode ? { type: "json_object" } : undefined,
    }),
  });

  if (!res.ok) throw new Error(`${provider.provider} error: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

const CHAT_DEFAULT_REPLY = "Here are some titles that match your request.";

const CHAT_SYSTEM_PROMPT = `You are Huntarr, a media recommendation assistant. The user message is your primary input — interpret their intent accurately and return structured search criteria JSON.
Return ONLY valid JSON with keys: reply (string), criteria (object), confidence ("high" | "low").

Set confidence to "high" when the request maps clearly to search criteria. Set confidence to "low" when the request is ambiguous, contradictory, or you are unsure how to interpret it.

Workflow: you interpret the request → Huntarr queries TMDB with your criteria → only verified TMDB titles appear as poster cards below your reply. Never invent or name specific titles in the reply text.

The reply must be 1-2 plain English sentences (under 200 characters). No reasoning, code, markup, or internal tokens — only user-facing text.

Criteria fields:
- genres (string[]): TMDB genre names. Map natural language to genres, including plurals and synonyms: comedy/comedies/funny/hilarious -> "Comedy" (NOT "Stand-Up Comedy" unless they ask for stand-up); horror/horrors/scary -> "Horror"; thriller/thrillers/suspense -> "Thriller"; drama/dramas -> "Drama"; action/actions -> "Action"; sci-fi/sci fi/science fiction -> "Science Fiction"; documentary/documentaries -> "Documentary"; romance/romances/romantic -> "Romance"; animation/animated/cartoon/anime -> "Animation"; mystery/mysteries -> "Mystery"; fantasy/fantasies -> "Fantasy"; crime/crimes/true crime -> "Crime"; stand-up/standup/comedy special -> "Stand-Up Comedy" (movies only)
- keywords (string[]): TMDB keyword terms for themes/topics, e.g. "marijuana", "cannabis", "sitcom", "heist", "time travel". Use for "shows about X" / "X related" requests — never put theme words in withPersonName.
- withPersonName (string): real person names only, e.g. "Tim Allen", "Taylor Sheridan"
- withPersonCreditType ("cast" | "crew" | "both"): use "cast" for starring/featuring/with/comedies with X/movies with X; "crew" for by/from/created by/written by; default "both" only when unclear
- mediaType ("movie" | "tv" | "all"): use "all" for genre+person without explicit type (e.g. "comedies with Tim Allen"); "tv" for sitcoms/series; "movie" for films
- dateMin, dateMax (ISO dates YYYY-MM-DD): for recent/new content or time windows — past/last/previous/recent N days|weeks|months|years; "past week", "last month", "this year", "recently", "latest", "just released", "brand new", etc. For a specific year ("from 2024", "2024 movies") set dateMin to YYYY-01-01 and dateMax to YYYY-12-31. For ranges ("2010-2020", "between 2000 and 2010", "1990s") set both bounds to the full window. For TV, filters first_air_date. Always set both bounds.
- yearMin, yearMax (number): optional shorthand for the same window; prefer dateMin/dateMax when possible
- moreLikeTitle (string): a specific show/movie title ONLY — never include filters like runtime, year, or "that are under 2 hours". Example: "movies like the godfather that are under 2 hours" -> moreLikeTitle "The Godfather", mediaType "movie", runtimeMax 120
- minRating, runtimeMin, runtimeMax, language (ISO 639-1): runtime values are minutes (under 2 hours -> runtimeMax 120). use minRating 7+ for high ratings/highly rated/well reviewed/critically acclaimed/top rated
- mood (string): short description of tone, e.g. "funny and lighthearted", "romantic comedy", "gritty"
- exclusions (string[]): titles or themes to avoid
- excludeWatched, excludeInLibrary (bool)

Interpret descriptive requests literally: "funny tv shows like chick flicks" -> mediaType "tv", genres ["Comedy", "Romance"], keywords ["romantic comedy"], mood "funny romantic comedy". "stand-up comedy specials" -> mediaType "movie", genres ["Stand-Up Comedy"]. "sitcoms from the past 2 months" -> mediaType "tv", genres ["Comedy"], keywords ["sitcom"]. "comedies with Tim Allen" -> mediaType "all", genres ["Comedy"], withPersonName "Tim Allen", withPersonCreditType "cast". "shows about weed" -> mediaType "tv", keywords ["marijuana", "cannabis", "weed"] — NOT a person name. "Taylor Sheridan shows" -> mediaType "tv", withPersonName "Taylor Sheridan", withPersonCreditType "crew".

When criteria includes genres, only recommend titles that match those genres. "Show me" is not a request for TV — do not set mediaType to tv unless the user asks for TV, series, or sitcoms.

Each user message is an independent fresh browse search. Parse ONLY the latest user message. Never use Stand-Up Comedy unless the user explicitly asks for stand-up, standup, or comedy specials.

When the user asks for "high ratings" or "highly rated", set minRating to 7 or higher.

When resolving withPersonName, prefer creators and actors the user watches (from their Tautulli history, Plex library, and liked list) when names are ambiguous.`;

export type ChatParseResult = {
  reply: string;
  criteria: Record<string, unknown>;
  aiParsed: boolean;
  usedProvider: PreferAIProvider | "local";
  confidence: "high" | "low";
};

/**
 * 1. Preferred provider (OpenRouter by default) parses the user message into a reply + search criteria.
 * 2. Low confidence / weak criteria / failure falls back to Anthropic when configured.
 * 3. Criteria are corrected only for known failure modes, then resolved against TMDB.
 * 4. Title cards come exclusively from TMDB — the AI never invents movies or shows.
 */
export async function resolveChatRequestFromMessage(
  userId: string,
  message: string,
  options: { preferProvider?: PreferAIProvider; allowAnthropicFallback?: boolean } = {}
): Promise<ChatParseResult> {
  const preferProvider = options.preferProvider ?? "openrouter";
  const allowAnthropicFallback =
    options.allowAnthropicFallback ?? preferProvider === "openrouter";

  try {
    const parsed = await parseCriteriaFromChat(userId, message, {}, [], { preferProvider });
    const needsFallback =
      allowAnthropicFallback &&
      preferProvider !== "anthropic" &&
      (parsed.confidence === "low" || !hasDeterministicSearchIntent(parsed.criteria));

    if (needsFallback && (await hasAIProvider(userId, "anthropic"))) {
      try {
        const retry = await parseCriteriaFromChat(userId, message, {}, [], {
          preferProvider: "anthropic",
        });
        return {
          ...retry,
          aiParsed: true,
          usedProvider: "anthropic",
        };
      } catch (retryErr) {
        console.warn("Chat Anthropic fallback failed:", retryErr);
      }
    }

    return {
      ...parsed,
      aiParsed: true,
      usedProvider: preferProvider,
    };
  } catch (err) {
    console.warn("Chat AI parse failed:", err);

    if (
      allowAnthropicFallback &&
      preferProvider !== "anthropic" &&
      (await hasAIProvider(userId, "anthropic"))
    ) {
      try {
        const retry = await parseCriteriaFromChat(userId, message, {}, [], {
          preferProvider: "anthropic",
        });
        return {
          ...retry,
          aiParsed: true,
          usedProvider: "anthropic",
        };
      } catch (retryErr) {
        console.warn("Chat Anthropic fallback after OpenRouter failure also failed:", retryErr);
      }
    }

    return {
      reply: buildContextualChatReply(message, CHAT_DEFAULT_REPLY),
      criteria: resolveChatCriteriaFromMessage(message),
      aiParsed: false,
      usedProvider: "local",
      confidence: "low",
    };
  }
}

export async function parseCriteriaFromChat(
  userId: string,
  userMessage: string,
  _currentCriteria: Record<string, unknown> = {},
  _priorUserMessages: string[] = [],
  options: { preferProvider?: PreferAIProvider } = {}
): Promise<{
  reply: string;
  criteria: Record<string, unknown>;
  confidence: "high" | "low";
}> {
  const preferProvider = options.preferProvider ?? "openrouter";

  const content = await chatCompletion(
    userId,
    [
      { role: "system", content: CHAT_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    {
      jsonMode: true,
      temperature: 0.3,
      preferProvider,
      preferOpenRouter: preferProvider === "openrouter",
      // Only the Anthropic-prefer path may call Claude; OpenRouter path stays Claude-free
      // so resolveChatRequestFromMessage can track fallbacks accurately.
      allowAnthropic: preferProvider === "anthropic",
    }
  );

  return parseChatAIResponse(content, {}, userMessage);
}

export async function rerankRecommendations(
  userId: string,
  candidates: Array<{
    id: number;
    title: string;
    overview?: string;
    genres?: string[];
    tmdbRating?: number;
    popularity?: number;
    voteCount?: number;
    rtCriticsScore?: number;
    rtAudienceScore?: number;
  }>,
  tasteSummary: string,
  criteria: Record<string, unknown>
): Promise<Array<{ id: number; reason: string; score: number }>> {
  const systemPrompt = `Rank TMDB-verified media recommendations for the user. Every candidate id is a real title from TMDB — only rank from this list. Return ONLY JSON: { "rankings": [{ "id": number, "reason": string, "score": number }] }
Score is a 0-100 personal fit percentage (100 = perfect fit for this user). Sort candidates by score descending.
Reason strings are ignored — attribution is assigned separately from each candidate's seedKind/seedTitle.
Balance personalization with popularity: strongly prefer widely popular, trending titles (high TMDB popularity/vote counts and ratings) when they still fit the user's taste — trending and popular browse picks should rank above obscure similar-title matches.
When a candidate has seedKind "watched", "library", "liked", or "liked_person", score it as a strong personal match if it fits that seed's taste cluster.
Prefer titles connected to the user's Tautulli watch history and Plex library first, then their liked list (~60/40 weight), over generic trending/popular picks (no seedKind).
When criteria includes keywords, favor titles that match those themes (e.g. heist, time travel, romantic comedy).
Favor well-reviewed titles: TMDB 7.0+ and Rotten Tomatoes critics scores of 60%+ (Fresh/Certified Fresh) when personal fit is similar.
For reason, return an empty string or a placeholder — it will not be shown.`;

  const content = await chatCompletion(
    userId,
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Taste: ${tasteSummary}\nCriteria: ${JSON.stringify(criteria)}\nCandidates: ${JSON.stringify(candidates)}`,
      },
    ],
    { jsonMode: true, temperature: 0.5, preferOpenRouter: true, preferProvider: "openrouter", allowAnthropic: false }
  );

  try {
    const parsed = JSON.parse(content);
    const candidateIds = new Set(candidates.map((c) => c.id));
    return (parsed.rankings ?? []).filter(
      (rank: { id?: number }) =>
        typeof rank.id === "number" && candidateIds.has(rank.id)
    );
  } catch {
    return candidates.map((c, i) => ({
      id: c.id,
      reason: "Matches your preferences",
      score: 100 - i,
    }));
  }
}
