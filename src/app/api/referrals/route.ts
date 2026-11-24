import { db } from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { referralCodeFor, REFERRAL_CREDIT } from "@/lib/referrals";

/** GET /api/referrals — my code, share link and the friends who joined with it. */
export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const code = await referralCodeFor(auth.id);
  const refs = await db.referral.findMany({ where: { referrerId: auth.id }, orderBy: { createdAt: "desc" } });
  const users = await db.user.findMany({ where: { id: { in: refs.map((r) => r.referredId) } }, select: { id: true, name: true, role: true } });
  const origin = new URL(req.url).origin;
  return Response.json({
    data: {
      code,
      link: `${origin}/?ref=${code}`,
      credit: REFERRAL_CREDIT,
      earned: refs.reduce((a, r) => a + r.credit, 0),
      friends: refs.map((r) => ({ id: r.id, name: users.find((u) => u.id === r.referredId)?.name ?? "Friend", role: users.find((u) => u.id === r.referredId)?.role ?? "", at: r.createdAt, credit: r.credit })),
    },
  });
}
