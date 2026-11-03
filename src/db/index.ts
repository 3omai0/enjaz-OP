import type { PGlite as PGliteClient } from "@electric-sql/pglite";
import type { BatchItem } from "drizzle-orm/batch";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const DATABASE_URL = process.env.DATABASE_URL?.trim();
export const isNeon = !!DATABASE_URL && /^postgres(ql)?:\/\//.test(DATABASE_URL);

/**
 * Database access.
 *
 * With DATABASE_URL set to a Neon connection string the app talks to Neon over
 * HTTP (serverless friendly, nothing to pool). Without it, the app runs an
 * embedded Postgres (PGlite) stored under ./.data/pglite so the whole system
 * works locally before Neon is connected. Both share the same schema,
 * migrations and query code.
 */
type GlobalDb = typeof globalThis & {
  /** The embedded database, opened once per process: its folder cannot be opened twice. */
  __injazPglite?: Promise<PGliteClient>;
  /** Migrations of the embedded database, run one after another. */
  __injazMigrations?: Promise<unknown>;
};
const g = globalThis as GlobalDb;

/**
 * The query layer, rebuilt whenever this module loads again. In development
 * a schema change reloads it, and queries must use the new tables and
 * relations at once: a copy kept from before the change fails on them (for
 * example "Cannot read properties of undefined (reading 'referencedTable')").
 * Only the embedded database itself is kept across reloads.
 */
let dbPromise: Promise<Db> | undefined;

const RETRY_DELAYS_MS = [400, 1200, 2500];
const REQUEST_TIMEOUT_MS = 20_000;

/** Errors raised before a request leaves the machine: resending can never run a query twice. */
const CONNECT_ERRORS = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT"]);

function errorCode(err: unknown): string | undefined {
  const cause = (err as { cause?: { code?: string } } | undefined)?.cause;
  return cause?.code ?? (err as { code?: string } | undefined)?.code;
}

/** True when every statement in a Neon HTTP request is a plain read. */
function isReadOnly(init?: RequestInit) {
  if (typeof init?.body !== "string") return false;
  try {
    const body = JSON.parse(init.body) as { query?: string; queries?: Array<{ query: string }> };
    const statements = body.queries ? body.queries.map((q) => q.query) : body.query ? [body.query] : [];
    return statements.length > 0 && statements.every((q) => /^\s*select\b/i.test(q));
  } catch {
    return false;
  }
}

/**
 * fetch with retries for transient network failures. Neon's free tier
 * suspends idle computes and the first request after a pause can drop while
 * it wakes. Reads are retried on any network failure; writes only when the
 * connection was never established, so an insert is never applied twice.
 */
async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const readOnly = isReadOnly(init);
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (err) {
      lastError = err;
      const retryable = readOnly || CONNECT_ERRORS.has(errorCode(err) ?? "");
      if (!retryable || attempt === RETRY_DELAYS_MS.length) break;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function createNeon(): Promise<Db> {
  // Node tries IPv6 first by default; on networks with a broken IPv6 route that
  // means a long stall before falling back. Prefer IPv4 for the whole process.
  const dns = await import("node:dns");
  dns.setDefaultResultOrder("ipv4first");

  const { neon, neonConfig } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  neonConfig.fetchFunction = fetchWithRetry;
  const sqlClient = neon(DATABASE_URL as string);
  return drizzle(sqlClient, { schema }) as unknown as Db;
}

async function createPglite(): Promise<Db> {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PGLITE !== "true") {
    throw new Error("DATABASE_URL is not set. Add your Neon connection string to .env (see README).");
  }
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const path = await import("node:path");
  // The ignore comments keep the bundler from tracing the whole project because of these runtime paths.
  g.__injazPglite ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const fs = await import("node:fs");
    // PGLITE_DIR lets tests and previews use a separate local database.
    const dir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.PGLITE_DIR?.trim() || path.join(".data", "pglite"));
    fs.mkdirSync(dir, { recursive: true });
    return new PGlite(dir);
  })().catch((err) => {
    g.__injazPglite = undefined;
    throw err;
  });
  const db = drizzle(await g.__injazPglite, { schema });
  // Migrations added while the app runs are applied as soon as code that needs them loads.
  const run = (g.__injazMigrations ?? Promise.resolve()).then(() => migrate(db, { migrationsFolder: path.resolve(/*turbopackIgnore: true*/ process.cwd(), "drizzle") }));
  g.__injazMigrations = run.catch(() => undefined);
  await run;
  return db as unknown as Db;
}

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = (isNeon ? createNeon() : createPglite()).catch((err) => {
      dbPromise = undefined;
      throw err;
    });
  }
  return dbPromise;
}

/** A write that belongs to an atomic group. Build it from the handle passed to the builder. */
export type AtomicQuery = BatchItem<"pg">;

const AFTER_COMMIT = Symbol("afterCommit");
type WithHook = { [AFTER_COMMIT]?: () => void };

/**
 * Attach work that must only happen once the whole group has committed, such
 * as sending device notifications for rows the query inserts. It never runs
 * when the group fails and rolls back.
 */
export function afterCommit<Q extends AtomicQuery>(query: Q, run: () => void): Q {
  (query as Q & WithHook)[AFTER_COMMIT] = run;
  return query;
}

function runAfterCommit(queries: AtomicQuery[]) {
  for (const query of queries) {
    try {
      (query as AtomicQuery & WithHook)[AFTER_COMMIT]?.();
    } catch (err) {
      console.error(err);
    }
  }
}

/**
 * Run several writes as one transaction: all of them apply or none do.
 * Neon's HTTP driver has no interactive transactions, so the statements are
 * sent as one batch (Neon runs a batch inside a single transaction). Locally
 * the same statements run inside a PGlite transaction. Statements cannot read
 * each other's results, so generate ids up front with crypto.randomUUID().
 */
export async function atomic(build: (q: Db) => AtomicQuery[]): Promise<void> {
  const db = await getDb();
  if (isNeon) {
    const queries = build(db);
    if (queries.length === 0) return;
    await (db as unknown as NeonHttpDatabase<typeof schema>).batch(queries as [AtomicQuery, ...AtomicQuery[]]);
    runAfterCommit(queries);
    return;
  }
  let queries: AtomicQuery[] = [];
  await db.transaction(async (tx) => {
    queries = build(tx as unknown as Db);
    for (const query of queries) await query;
  });
  runAfterCommit(queries);
}

export { schema };
