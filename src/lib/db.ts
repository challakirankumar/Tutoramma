import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Prisma on Cloudflare D1.
 *
 * The D1 binding (`env.DB`) is only reachable inside a request, so `db` is a
 * lightweight proxy that resolves a PrismaClient bound to the current
 * request's D1 database. Clients are cached per binding object, so a warm
 * isolate reuses the same client across requests.
 */
const cache = new WeakMap<object, PrismaClient>();

export function getDb(): PrismaClient {
  const { env } = getCloudflareContext();
  const d1 = (env as CloudflareEnv).DB;
  if (!d1) throw new Error("D1 binding `DB` is not configured. Check wrangler.jsonc.");
  let client = cache.get(d1);
  if (!client) {
    client = new PrismaClient({ adapter: new PrismaD1(d1) });
    cache.set(d1, client);
  }
  return client;
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getDb();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});
