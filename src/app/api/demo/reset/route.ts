import { seedDemoData } from "@/lib/seed-runtime";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

/**
 * Re-seed the demo dataset.
 * Allowed when: the database is empty (first-run bootstrap), the caller is an
 * admin, or the request carries the DEMO_RESET_KEY secret.
 */
export async function POST(req: Request) {
  try {
    const users = await db.user.count();
    const me = await getAuthUser();
    const key = process.env.DEMO_RESET_KEY;
    const keyOk = !!key && req.headers.get("x-demo-reset-key") === key;
    if (users > 0 && me?.role !== "admin" && !keyOk) {
      return Response.json({ error: { code: "FORBIDDEN", message: "Only an admin can reset the demo data." } }, { status: 403 });
    }
    const res = await seedDemoData();
    return Response.json({ data: res });
  } catch (e) {
    return Response.json({ error: { code: "VALIDATION_ERROR", message: "Seed failed: " + (e as Error).message } }, { status: 500 });
  }
}
