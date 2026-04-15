import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle> | null = null;
let _client: postgres.Sql | null = null;

export function getClient(): postgres.Sql {
  if (!_client) {
    const connectionString =
      process.env.DATABASE_URL ||
      "postgres://ndns:ndns_secret@localhost:5433/ndns_analytic";
    _client = postgres(connectionString);
  }
  return _client;
}

export function getDb() {
  if (!_db) {
    const client = getClient();
    _db = drizzle(client, { schema });
  }
  return _db;
}

export async function closeDb() {
  if (_client) {
    await _client.end();
    _client = null;
    _db = null;
  }
}
