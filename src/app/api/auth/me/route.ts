import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return Response.json({ data: null });
  const counts = await db.notification.count({ where: { userId: auth.id, read: false } });
  return Response.json({ data: { ...auth, unreadNotifications: counts } });
}
