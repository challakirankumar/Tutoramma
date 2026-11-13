import { generateDemoData } from "@/lib/seed";

/**
 * Developer-only: regenerates the demo dataset row-by-row from src/lib/seed.ts
 * so `scripts/snapshot-seed.mjs` can snapshot it. Disabled unless the worker
 * runs with ALLOW_SEED_GENERATE=1 (never set this in production).
 */
export async function POST() {
  if (process.env.ALLOW_SEED_GENERATE !== "1") {
    return Response.json({ error: { code: "FORBIDDEN", message: "Seed generation is disabled." } }, { status: 403 });
  }
  const res = await generateDemoData();
  return Response.json({ data: res });
}
