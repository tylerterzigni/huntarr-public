import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  hasAIProvider,
  resolveChatRequestFromMessage,
} from "@/lib/ai/provider";
import {
  buildContinuationCriteriaPatch,
  buildContinuationReply,
  collectShownMediaKeys,
  criteriaSnapshotToSearchCriteria,
  findPriorSearchMessage,
  hasPriorSearchCriteria,
  isCorrectionRequest,
  isSearchContinuationRequest,
} from "@/lib/ai/chat-continuation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userPreferences, chatSessions } from "@/lib/db/schema";
import { normalizeChatCriteria } from "@/lib/recommendations/normalize-criteria";
import { getChatRecommendations } from "@/lib/recommendations/chat-search";
import { hasDateCriteria } from "@/lib/search/date-criteria";
import type { RecommendationItem, SearchCriteria } from "@/types";

export const maxDuration = 60;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [existingSession] = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.userId, session.user.id))
    .limit(1);

  const defaultMessage = {
    role: "assistant" as const,
    content:
      "Tell me what you're in the mood for. I can adjust genres, runtime, mood, and exclusions to refine your recommendations.",
  };

  const messages = existingSession?.messages?.length
    ? existingSession.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        items: (m as { items?: RecommendationItem[] }).items,
      }))
    : [defaultMessage];

  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { message } = await request.json();
  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const [existingSession] = await Promise.all([
    db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.userId, session.user.id))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  const wantsMore = isSearchContinuationRequest(message);
  const wantsCorrection = !wantsMore && isCorrectionRequest(message);
  const priorSnapshot = existingSession?.criteriaSnapshot ?? {};
  let reply = "Here are some titles that match your request.";
  let normalizedCriteria: SearchCriteria;
  let excludeKeys: string[] = [];
  let usedProvider: "openrouter" | "anthropic" | "local" = "openrouter";
  let searchMessage = typeof message === "string" ? message : "";

  if (wantsMore) {
    if (!hasPriorSearchCriteria(priorSnapshot)) {
      return NextResponse.json({
        reply:
          "I don't have a previous search to continue. Try a new request like \"movies with Tim Allen\" first.",
        criteria: {},
        items: [],
      });
    }

    normalizedCriteria = criteriaSnapshotToSearchCriteria(priorSnapshot);
    excludeKeys = collectShownMediaKeys(existingSession?.messages ?? undefined);

    const continuationPatch = buildContinuationCriteriaPatch(message);
    if (Object.keys(continuationPatch).length > 0) {
      const refreshed = await normalizeChatCriteria(
        { ...priorSnapshot, ...continuationPatch },
        session.user.id
      );
      normalizedCriteria = refreshed;
    }

    reply = buildContinuationReply(normalizedCriteria);
  } else if (wantsCorrection) {
    const priorSearch = findPriorSearchMessage(existingSession?.messages ?? undefined);
    if (!priorSearch) {
      return NextResponse.json({
        reply:
          "I don't have a previous search to retry. Try a new request like \"movies with Tim Allen\" first.",
        criteria: {},
        items: [],
      });
    }

    if (!(await hasAIProvider(session.user.id, "anthropic"))) {
      return NextResponse.json({
        reply:
          "I couldn't retry with Claude — add an Anthropic AI provider in Settings, then try again.",
        criteria: priorSnapshot,
        items: [],
      });
    }

    searchMessage = priorSearch;
    excludeKeys = collectShownMediaKeys(existingSession?.messages ?? undefined);
    const parsed = await resolveChatRequestFromMessage(session.user.id, priorSearch, {
      preferProvider: "anthropic",
      allowAnthropicFallback: false,
    });
    reply = parsed.reply;
    usedProvider = parsed.usedProvider;
    normalizedCriteria = await normalizeChatCriteria(parsed.criteria, session.user.id);
  } else {
    const parsed = await resolveChatRequestFromMessage(session.user.id, message);
    reply = parsed.reply;
    usedProvider = parsed.usedProvider;
    normalizedCriteria = await normalizeChatCriteria(parsed.criteria, session.user.id);
  }

  const savedCriteria: Record<string, unknown> = { ...normalizedCriteria };

  if (!wantsMore) {
    await db
      .update(userPreferences)
      .set({ chatCriteria: savedCriteria, updatedAt: new Date() })
      .where(eq(userPreferences.userId, session.user.id));
  }

  let items: RecommendationItem[] = [];
  try {
    if (!normalizedCriteria.moreLikeUnresolved) {
      items = await getChatRecommendations(
        session.user.id,
        normalizedCriteria,
        8,
        wantsMore ? undefined : searchMessage,
        { excludeKeys }
      );
    }
  } catch (err) {
    console.error("Chat recommendations failed:", err);
  }

  if (normalizedCriteria.moreLikeUnresolved) {
    items = [];
  } else if (items.length > 0 && normalizedCriteria.moreLike?.title) {
    const anchor = normalizedCriteria.moreLike.title;
    const runtimeClause =
      normalizedCriteria.runtimeMax != null
        ? normalizedCriteria.runtimeMax % 60 === 0
          ? ` under ${normalizedCriteria.runtimeMax / 60} hours`
          : ` under ${normalizedCriteria.runtimeMax} minutes`
        : normalizedCriteria.runtimeMin != null
          ? normalizedCriteria.runtimeMin % 60 === 0
            ? ` over ${normalizedCriteria.runtimeMin / 60} hours`
            : ` over ${normalizedCriteria.runtimeMin} minutes`
          : "";
    reply = wantsMore
      ? buildContinuationReply(normalizedCriteria)
      : normalizedCriteria.moreLike.mediaType === "movie"
        ? `Here are movies similar to ${anchor}${runtimeClause}.`
        : `Here are shows similar to ${anchor}${runtimeClause}.`;
  } else if (items.length > 0 && normalizedCriteria.withPerson?.name) {
    const name = normalizedCriteria.withPerson.name;
    if (wantsMore) {
      reply = buildContinuationReply(normalizedCriteria);
    } else if (normalizedCriteria.mediaType === "movie") {
      reply =
        normalizedCriteria.withPerson.creditType === "cast"
          ? `Here are movies featuring ${name}.`
          : `Here are movies from ${name}.`;
    } else if (normalizedCriteria.mediaType === "tv") {
      reply =
        normalizedCriteria.withPerson.creditType === "cast"
          ? `Here are shows featuring ${name}.`
          : `Here are shows from ${name}.`;
    } else {
      reply =
        normalizedCriteria.withPerson.creditType === "cast"
          ? `Here are titles featuring ${name}.`
          : `Here are titles from ${name}.`;
    }
  }

  // Empty / unresolved after first parse: re-query AI with the full message, then TMDB.
  const needsAiRetry =
    !wantsMore &&
    !wantsCorrection &&
    (items.length === 0 || Boolean(normalizedCriteria.moreLikeUnresolved)) &&
    !normalizedCriteria.withPersonUnresolved;

  if (needsAiRetry) {
    const canAnthropic =
      usedProvider === "openrouter" && (await hasAIProvider(session.user.id, "anthropic"));
    if (canAnthropic || usedProvider === "local") {
      try {
        const retry = await resolveChatRequestFromMessage(session.user.id, searchMessage, {
          preferProvider: canAnthropic ? "anthropic" : "openrouter",
          allowAnthropicFallback: false,
        });
        const retryCriteria = await normalizeChatCriteria(retry.criteria, session.user.id);
        if (!retryCriteria.moreLikeUnresolved) {
          const retryItems = await getChatRecommendations(
            session.user.id,
            retryCriteria,
            8,
            searchMessage,
            { excludeKeys }
          );
          if (retryItems.length > 0) {
            reply = retry.reply;
            usedProvider = retry.usedProvider;
            normalizedCriteria = retryCriteria;
            items = retryItems;
            for (const key of Object.keys(savedCriteria)) {
              delete savedCriteria[key];
            }
            Object.assign(savedCriteria, retryCriteria);

            await db
              .update(userPreferences)
              .set({ chatCriteria: savedCriteria, updatedAt: new Date() })
              .where(eq(userPreferences.userId, session.user.id));

            if (normalizedCriteria.moreLike?.title) {
              const anchor = normalizedCriteria.moreLike.title;
              reply =
                normalizedCriteria.moreLike.mediaType === "movie"
                  ? `Here are movies similar to ${anchor}.`
                  : `Here are shows similar to ${anchor}.`;
            }
          }
        }
      } catch (err) {
        console.warn("Chat empty/unresolved AI retry failed:", err);
      }
    }
  }

  const hasDateRange = hasDateCriteria(normalizedCriteria);

  const finalReply =
    items.length === 0
      ? wantsMore
        ? `${reply} I couldn't find any more matching titles.`
        : wantsCorrection
          ? `${reply} I still couldn't find matching titles — try rephrasing your request.`
          : normalizedCriteria.moreLikeUnresolved
            ? `I couldn't find "${normalizedCriteria.moreLikeUnresolved}" on TMDB or IMDb. Double-check the title spelling, or add an OMDb API key in Settings for broader IMDb title lookup.`
          : normalizedCriteria.withPersonUnresolved
            ? `${reply} I couldn't find "${normalizedCriteria.withPersonUnresolved}" — check the spelling and try again.`
            : hasDateRange
              ? `${reply} I couldn't find titles that premiered in that date range — try a wider window.`
              : `${reply} I couldn't find matching titles — try broadening your search.`
      : wantsCorrection
        ? `${reply} I retried with a stronger model.`
        : normalizedCriteria.moreLikeUnresolved
          ? `I couldn't find "${normalizedCriteria.moreLikeUnresolved}" on TMDB or IMDb.`
        : reply;

  const newMessages = [
    ...(existingSession?.messages ?? []),
    { role: "user", content: message, createdAt: new Date().toISOString() },
    {
      role: "assistant",
      content: finalReply,
      items: items.length > 0 ? items : undefined,
      createdAt: new Date().toISOString(),
    },
  ];

  if (existingSession) {
    await db
      .update(chatSessions)
      .set({
        messages: newMessages,
        criteriaSnapshot: savedCriteria,
        updatedAt: new Date(),
      })
      .where(eq(chatSessions.userId, session.user.id));
  } else {
    await db.insert(chatSessions).values({
      userId: session.user.id,
      messages: newMessages,
      criteriaSnapshot: savedCriteria,
    });
  }

  return NextResponse.json({ reply: finalReply, criteria: savedCriteria, items });
}
