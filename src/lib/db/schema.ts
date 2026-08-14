import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", ["admin", "user"]);
export const integrationTypeEnum = pgEnum("integration_type", [
  "radarr",
  "sonarr",
  "plex",
  "tautulli",
]);
export const mediaTypeEnum = pgEnum("media_type", ["movie", "tv"]);
export const likedKindEnum = pgEnum("liked_kind", ["movie", "tv", "person"]);
export const hideScopeEnum = pgEnum("hide_scope", ["global", "user"]);
export const aiProviderEnum = pgEnum("ai_provider", [
  "openrouter",
  "openai",
  "anthropic",
  "ollama",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const integrationInstances = pgTable(
  "integration_instances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: integrationTypeEnum("type").notNull(),
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    encryptedCredentials: text("encrypted_credentials").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().default({}),
    isDefault: boolean("is_default").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("integration_type_name_idx").on(table.type, table.name),
  ]
);

export const aiProviderConfigs = pgTable(
  "ai_provider_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: aiProviderEnum("provider").notNull(),
    name: text("name").notNull(),
    encryptedApiKey: text("encrypted_api_key"),
    baseUrl: text("base_url"),
    model: text("model").notNull(),
    priority: integer("priority").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("ai_provider_configs_user_id_idx").on(table.userId)]
);

export const globalSettings = pgTable("global_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  encryptedValue: text("encrypted_value"),
  plainValue: text("plain_value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userPreferences = pgTable("user_preferences", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  tautulliUsernames: jsonb("tautulli_usernames").$type<string[]>().default([]),
  recommendationWeights: jsonb("recommendation_weights")
    .$type<Record<string, number>>()
    .default({}),
  chatCriteria: jsonb("chat_criteria").$type<Record<string, unknown>>().default({}),
  recommendationKeywords: jsonb("recommendation_keywords").$type<string[]>().default([]),
  filterDefaults: jsonb("filter_defaults").$type<Record<string, unknown>>().default({}),
  homeRowOrder: jsonb("home_row_order").$type<string[]>().default([]),
  homeRowHidden: jsonb("home_row_hidden").$type<string[]>().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const likedListItems = pgTable(
  "liked_list_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tmdbId: integer("tmdb_id").notNull(),
    kind: likedKindEnum("kind").notNull(),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("liked_list_unique_idx").on(table.userId, table.tmdbId, table.kind),
  ]
);

export const hideListItems = pgTable(
  "hide_list_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tmdbId: integer("tmdb_id").notNull(),
    mediaType: mediaTypeEnum("media_type").notNull(),
    scope: hideScopeEnum("scope").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("hide_list_unique_idx").on(
      table.tmdbId,
      table.mediaType,
      table.scope,
      table.userId
    ),
  ]
);

export const recommendationProfiles = pgTable("recommendation_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  genres: jsonb("genres").$type<Record<string, number>>().default({}),
  actors: jsonb("actors").$type<Record<string, number>>().default({}),
  directors: jsonb("directors").$type<Record<string, number>>().default({}),
  decades: jsonb("decades").$type<Record<string, number>>().default({}),
  avgRating: integer("avg_rating"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const watchHistoryCache = pgTable(
  "watch_history_cache",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tautulliUsername: text("tautulli_username").notNull(),
    tmdbId: integer("tmdb_id").notNull(),
    mediaType: mediaTypeEnum("media_type").notNull(),
    title: text("title").notNull(),
    watchedAt: timestamp("watched_at", { withTimezone: true }),
    playCount: integer("play_count").notNull().default(1),
    ratingKey: text("rating_key"),
    fullyWatched: boolean("fully_watched").notNull().default(false),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("watch_history_unique_idx").on(
      table.tautulliUsername,
      table.tmdbId,
      table.mediaType
    ),
  ]
);

export const plexLibraryCache = pgTable(
  "plex_library_cache",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tmdbId: integer("tmdb_id").notNull(),
    mediaType: mediaTypeEnum("media_type").notNull(),
    title: text("title").notNull(),
    inLibrary: boolean("in_library").notNull().default(true),
    availabilityState: text("availability_state").default("available"),
    plexGuid: text("plex_guid"),
    plexRatingKey: text("plex_rating_key"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("plex_library_unique_idx").on(table.tmdbId, table.mediaType),
  ]
);

export const arrRequestsLog = pgTable("arr_requests_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => integrationInstances.id, { onDelete: "cascade" }),
  tmdbId: integer("tmdb_id").notNull(),
  mediaType: mediaTypeEnum("media_type").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("pending"),
  externalId: integer("external_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  criteriaSnapshot: jsonb("criteria_snapshot").$type<Record<string, unknown>>().default({}),
  messages: jsonb("messages")
    .$type<
      Array<{
        role: string;
        content: string;
        createdAt: string;
        items?: unknown[];
      }>
    >()
    .default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tmdbCache = pgTable("tmdb_cache", {
  id: uuid("id").defaultRandom().primaryKey(),
  cacheKey: text("cache_key").notNull().unique(),
  data: jsonb("data").$type<unknown>().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const recommendationCache = pgTable("recommendation_cache", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  cacheKey: text("cache_key").notNull(),
  data: jsonb("data").$type<unknown>().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  preferences: one(userPreferences),
  recommendationProfile: one(recommendationProfiles),
  hideListItems: many(hideListItems),
  likedListItems: many(likedListItems),
  chatSessions: many(chatSessions),
  arrRequests: many(arrRequestsLog),
  aiProviderConfigs: many(aiProviderConfigs),
}));

export type User = typeof users.$inferSelect;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type IntegrationInstance = typeof integrationInstances.$inferSelect;
export type HideListItem = typeof hideListItems.$inferSelect;
export type LikedListItem = typeof likedListItems.$inferSelect;
export type LikedKind = typeof likedListItems.$inferSelect["kind"];
