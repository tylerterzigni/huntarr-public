import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

let _db: Db | undefined;

function getDbInstance(): Db {
  if (_db) return _db;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = postgres(connectionString, { max: 10 });
  _db = drizzle(client, { schema });
  return _db;
}

/** Lazy DB proxy — defers connection until first query (allows `next build` without DATABASE_URL). */
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const instance = getDbInstance();
    const value = instance[prop as keyof Db];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
