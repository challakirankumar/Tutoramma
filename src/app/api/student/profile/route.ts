import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, audit } from "@/lib/auth";

/**
 * PATCH /api/student/profile — { leaderboardOptIn: boolean }
 *
 * The class leaderboard is strictly opt-in (no public ranking of minors by
 * default). Students flip their own visibility; every change is audited.
 */
export async function PATCH(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "student") return forbidden("Only students can change their profile visibility.");

  let body: { leaderboardOptIn?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }

  if (typeof body?.leaderboardOptIn !== "boolean") {
    return badRequest("leaderboardOptIn must be true or false.");
  }

  const profile = await db.studentProfile.findUnique({ where: { userId: auth.id } });
  if (!profile) return forbidden("Student profile not found.");

  await db.studentProfile.update({
    where: { id: profile.id },
    data: { leaderboardOptIn: body.leaderboardOptIn },
  });

  await audit(
    { name: auth.name, role: auth.role },
    "student.leaderboard_optin",
    `StudentProfile: ${profile.id}`,
    body.leaderboardOptIn ? "Opted IN to the public leaderboard" : "Opted OUT of the public leaderboard"
  );

  return Response.json({ data: { leaderboardOptIn: body.leaderboardOptIn } });
}
