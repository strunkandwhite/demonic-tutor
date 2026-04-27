/**
 * In-memory libsql test harness. Each call returns a fresh isolated database
 * with the production schema applied.
 */

import { createClient, type Client } from "@libsql/client";
import { migrate } from "@/core/db/migrate";

export async function createTestDb(): Promise<Client> {
  const client = createClient({ url: ":memory:" });
  await client.execute("PRAGMA foreign_keys = ON");
  await migrate(client);
  return client;
}
