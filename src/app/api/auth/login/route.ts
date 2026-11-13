import { db } from "@/lib/db";
import { hashPassword, signToken, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return Response.json({ error: { code: "VALIDATION_ERROR", message: "Email and password are required." } }, { status: 422 });
    }
    const user = await db.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
    if (!user || user.password !== hashPassword(String(password))) {
      return Response.json({ error: { code: "UNAUTHENTICATED", message: "Incorrect email or password." } }, { status: 401 });
    }
    if (user.status !== "active") {
      return Response.json({ error: { code: "FORBIDDEN", message: "This account is not active." } }, { status: 403 });
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
