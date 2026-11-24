import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, audit } from "@/lib/auth";
import { joinCode, shareToken } from "@/lib/classroom-codes";

/** GET /api/classrooms — tutor: own classrooms with roster counts; student: classrooms joined. */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();

  if (auth.role === "tutor") {
    const rooms = await db.classroom.findMany({ where: { tutorId: auth.id }, orderBy: { createdAt: "desc" }, include: { members: { select: { status: true } } } });
    return Response.json({
      data: rooms.map(({ members, ...c }) => ({
        ...c,
        students: members.filter((m) => m.status === "active").length,
        pending: members.filter((m) => m.status === "pending").length,
        waitlisted: members.filter((m) => m.status === "waitlisted").length,
      })),
    });
  }

  if (auth.role === "student") {
    const mine = await db.classroomMember.findMany({ where: { studentId: auth.id, status: { not: "removed" } }, include: { classroom: true } });
    const tutorIds = [...new Set(mine.map((m) => m.classroom.tutorId))];
    const tutors = await db.user.findMany({ where: { id: { in: tutorIds } }, select: { id: true, name: true, avatarColor: true } });
    const tmap = new Map(tutors.map((t) => [t.id, t]));
    return Response.json({
      data: mine.map((m) => ({
        id: m.classroom.id,
        name: m.classroom.name,
        subject: m.classroom.subject,
        grade: m.classroom.grade,
        board: m.classroom.board,
        language: m.classroom.language,
        schedule: m.classroom.schedule,
        status: m.status,
        tutor: tmap.get(m.classroom.tutorId) ?? { id: m.classroom.tutorId, name: "Tutor", avatarColor: "#315BE5" },
      })),
    });
  }
  return forbidden();
}

/** POST /api/classrooms — tutor creates a classroom (spec §10 lifecycle step 1-2). */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "tutor") return forbidden("Only tutors can create classrooms.");
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const str = (k: string, max = 80) => String(b[k] ?? "").trim().slice(0, max);
  const name = str("name");
  const grade = str("grade", 30);
  const subject = str("subject", 40);
  if (!name || !grade || !subject) return badRequest("Name, grade and subject are required.", "VALIDATION_ERROR", { name: name ? "" : "Required" });
  const oneOf = (k: string, opts: string[], d: string) => (opts.includes(String(b[k])) ? String(b[k]) : d);

  let code = joinCode();
  for (let i = 0; i < 5 && (await db.classroom.findUnique({ where: { joinCode: code } })); i++) code = joinCode();

  const room = await db.classroom.create({
    data: {
      tutorId: auth.id,
      name,
      grade,
      subject,
      board: str("board", 30) || "CBSE",
      section: str("section", 20),
      language: str("language", 30) || "English",
      mode: oneOf("mode", ["online", "offline", "hybrid"], "online"),
      visibility: oneOf("visibility", ["private", "link", "public"], "link"),
      joinPolicy: oneOf("joinPolicy", ["instant", "approval", "paid"], "approval"),
      seats: Math.min(500, Math.max(1, Number(b.seats) || 30)),
      waitlist: b.waitlist !== false,
      pricePlan: oneOf("pricePlan", ["free", "per_class", "monthly", "package"], "free"),
      price: Math.max(0, Math.round(Number(b.price) || 0)),
      schedule: str("schedule", 80),
      recording: b.recording === true,
      status: "active",
      joinCode: code,
      shareToken: shareToken(),
    },
  });
  await audit({ name: auth.name, role: auth.role }, "classroom.created", `Classroom: ${room.name}`, `Join code ${room.joinCode}`);
  return Response.json({ data: room }, { status: 201 });
}
