import { db } from "@/lib/db";
import { seedDemoData } from "@/lib/seed-runtime";
import { hashPassword, signToken, SESSION_COOKIE } from "@/lib/auth";

const DEMO_ACCOUNTS: Record<string, string> = {
  student: "student.demo@tutoramma.test",
  parent: "parent.demo@tutoramma.test",
  tutor: "tutor.demo@tutoramma.test",
  institute: "institute.demo@tutoramma.test",
  admin: "admin.demo@tutoramma.test",
};

export async function POST(req: Request) {
  try {
    const { role } = await req.json();
    const email = DEMO_ACCOUNTS[role as string];
    if (!email) {
      return Response.json({ error: { code: "VALIDATION_ERROR", message: "Unknown demo role." } }, { status: 422 });
    }
    let user = await db.user.findUnique({ where: { email } });
    /* fresh deployment: seed the demo dataset on the very first demo login */
    if (!user && (await db.user.count()) === 0) {
      await seedDemoData();
      user = await db.user.findUnique({ where: { email } });
    }
    if (!user) {
      return Response.json({ error: { code: "NOT_FOUND", message: "Demo account not seeded yet. Please reset demo data." } }, { status: 404 });
    }
    const res = Response.json({
      data: { id: user.id, name: user.name, email: user.email, role: user.role, avatarColor: user.avatarColor, isDemo: user.isDemo },
    });
    res.headers.append(
      "Set-Cookie",
      `${SESSION_COOKIE}=${signToken(user.id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`
    );
    return res;
  } catch {
    return Response.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request." } }, { status: 422 });
  }
}
