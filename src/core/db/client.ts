/**
 * Turso database client singleton.
 */

import { createClient, type Client } from "@libsql/client";

let client: Client | null = null;
let initialized = false;

export async function getClient(): Promise<Client> {
  if (client && initialized) {
    return client;
  }

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error("TURSO_DATABASE_URL environment variable is not set");
  }

  if (!authToken) {
    throw new Error("TURSO_AUTH_TOKEN environment variable is not set");
  }

  client = createClient({ url, authToken });
  await client.execute("PRAGMA foreign_keys = ON");
  initialized = true;

  return client;
}

export function closeClient(): void {
  if (client) {
    client.close();
    client = null;
    initialized = false;
  }
}

export type { Client } from "@libsql/client";
