/**
 * Turso database client singleton.
 */

import { createClient, type Client } from "@libsql/client";

let clientPromise: Promise<Client> | null = null;

export function getClient(): Promise<Client> {
  if (clientPromise) {
    return clientPromise;
  }

  clientPromise = (async () => {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
      throw new Error("TURSO_DATABASE_URL environment variable is not set");
    }

    if (!authToken) {
      throw new Error("TURSO_AUTH_TOKEN environment variable is not set");
    }

    const client = createClient({ url, authToken });
    await client.execute("PRAGMA foreign_keys = ON");
    return client;
  })();

  return clientPromise;
}

export function closeClient(): void {
  if (clientPromise) {
    clientPromise.then(client => client.close()).catch(() => {});
    clientPromise = null;
  }
}

export type { Client } from "@libsql/client";
