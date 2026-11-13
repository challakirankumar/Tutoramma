import { getCloudflareContext } from "@opennextjs/cloudflare";
import snapshot from "@/lib/seed-snapshot.json";
import { hashPassword } from "@/lib/auth";

/**
 * Production demo seeding for Cloudflare D1.
 *
 * Replays the pre-built snapshot (see scripts/snapshot-seed.mjs) in ONE D1
 * batch — a single round-trip, executed as a transaction — instead of ~6,000
 * ORM queries, which would exceed the per-request D1 query limit.
 *
 * Dates are shifted so the demo is always relative to "today":
 *  · wall-clock slots (exact minutes, e.g. a class at 17:00) move by whole days
 *    so they keep their time of day;
 *  · everything else ("2 hours ago") moves by the exact elapsed time.
 */
interface Snapshot {
  anchor: number;
  tables: { name: string; columns: string[]; dateCols: string[]; rows: (string | number | null)[][] }[];
}

const DAY = 86_400_000;
const MAX_SQL = 90_000; // stay under D1's 100 KB statement limit

function lit(v: string | number | null): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function shiftIso(iso: string, exact: number, days: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const wallClock = t % 60_000 === 0;
  return new Date(t + (wallClock ? days : exact)).toISOString().replace("Z", "+00:00");
}

export async function seedDemoData() {
  const { env } = getCloudflareContext();
  const d1 = (env as unknown as { DB: D1Like }).DB;
  const snap = snapshot as unknown as Snapshot;

  const exact = Date.now() - snap.anchor;
  const days = Math.round(exact / DAY) * DAY;

  const sql: string[] = ["PRAGMA defer_foreign_keys = true"];
  for (const t of [...snap.tables].reverse()) sql.push(`DELETE FROM "${t.name}"`);

  /* demo passwords are re-hashed with THIS deployment's AUTH_SECRET */
  const demoPassword = hashPassword("demo1234");

  let rows = 0;
  for (const t of snap.tables) {
    const pwIdx = t.name === "User" ? t.columns.indexOf("password") : -1;
    if (!t.rows.length) continue;
    const dateIdx = t.dateCols.map((c) => t.columns.indexOf(c));
    const head = `INSERT INTO "${t.name}" (${t.columns.map((c) => `"${c}"`).join(",")}) VALUES `;
    let values: string[] = [];
    let size = head.length;
    const flush = () => {
      if (values.length) sql.push(head + values.join(","));
      values = [];
      size = head.length;
    };
    for (const r of t.rows) {
      const row = r.slice();
      for (const i of dateIdx) if (typeof row[i] === "string") row[i] = shiftIso(row[i] as string, exact, days);
      if (pwIdx >= 0) row[pwIdx] = demoPassword;
      const tuple = "(" + row.map(lit).join(",") + ")";
      if (size + tuple.length > MAX_SQL) flush();
      values.push(tuple);
      size += tuple.length + 1;
      rows++;
    }
    flush();
  }

  await d1.batch(sql.map((s) => d1.prepare(s)));
  return { ok: true, seeded: true, rows, statements: sql.length };
}

interface D1Like {
  prepare(sql: string): unknown;
  batch(statements: unknown[]): Promise<unknown>;
}
