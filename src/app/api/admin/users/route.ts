import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/** All users + role counts (admin only). */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();

  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, role: true, status: true, isDemo: true, createdAt: true, avatarColor: true, city: true },
    orderBy: { createdAt: "asc" },
  });

  const counts: Record<string, number> = {};
  for (const u of users) counts[u.role] = (counts[u.role] ?? 0) + 1;

  return Response.json({
    data: {
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        isDemo: u.isDemo,
        createdAt: u.createdAt,
        color: u.avatarColor,
        city: u.city,
      })),
      counts,
    },
  });
}
