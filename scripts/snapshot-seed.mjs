/**
 * Builds src/lib/seed-snapshot.json from a locally seeded D1 database.
 *
 * Why: the full demo dataset is ~6,000 rows. Writing it row-by-row through an
 * ORM would exceed Cloudflare's per-request D1 query limit, so production
 * seeding replays this snapshot in a single D1 batch, shifting every date so
 * the demo always looks "live" relative to today.
 *
 * Usage (after changing src/lib/seed.ts):
 *   1. npm run cf:build
 *   2. npx wrangler dev -c wrangler.test.jsonc --var ALLOW_SEED_GENERATE:1
 *   3. curl -X POST http://localhost:8787/api/demo/generate
 *   4. node scripts/snapshot-seed.mjs
 */
import { DatabaseSync } from "node:sqlite";
import { readdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const file = readdirSync(dir).find((f) => f.endsWith(".sqlite"));
if (!file) throw new Error("No local D1 database found — run the local worker and seed it first.");
const db = new DatabaseSync(join(dir, file), { readOnly: true });

// table order = order of CREATE TABLE statements in the migration
const sql = readFileSync("migrations/0001_init.sql", "utf8");
const order = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS "([^"]+)"/g)].map((m) => m[1]);
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}\+00:00$/;

let anchor = 0;
const tables = [];
for (const name of order) {
  const rows = db.prepare(`SELECT * FROM "${name}"`).all();
  const columns = db.prepare(`PRAGMA table_info("${name}")`).all().map((c) => c.name);
  const dateCols = columns.filter((c) => rows.some((r) => typeof r[c] === "string" && ISO.test(r[c])));
  if (name === "User") for (const r of rows) anchor = Math.max(anchor, Date.parse(r.createdAt));
  tables.push({ name, columns, dateCols, rows: rows.map((r) => columns.map((c) => r[c] ?? null)) });
}
const out = { anchor, generatedAt: new Date().toISOString(), tables };
writeFileSync("src/lib/seed-snapshot.json", JSON.stringify(out));
console.log(`seed snapshot: ${tables.reduce((a, t) => a + t.rows.length, 0)} rows in ${tables.length} tables (anchor ${new Date(anchor).toISOString()})`);
