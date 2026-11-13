import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/** List home-tuition sessions with safety context, scoped by role. */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();

  const sessions = await db.homeSession.findMany({
    include: { booking: true },
    orderBy: { booking: { startAt: "asc" } },
  });

  let scoped = sessions;
  if (auth.role === "tutor") {
    scoped = sessions.filter((s) => s.booking.tutorId === auth.id);
  } else if (auth.role === "parent") {
    const children = await db.studentProfile.findMany({ where: { parentEmail: auth.email } });
    const childIds = new Set(children.map((c) => c.userId));
    scoped = sessions.filter((s) => childIds.has(s.booking.studentId));
  } else if (auth.role !== "admin") {
    return forbidden();
  }

  /* resolve tutor + student users (Booking stores plain ids, no relation) */
  const userIds = [...new Set(scoped.flatMap((s) => [s.booking.tutorId, s.booking.studentId]))];
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, phone: true, avatarColor: true } });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const data = scoped.map((s) => {
    const tutor = userMap.get(s.booking.tutorId);
    const student = userMap.get(s.booking.studentId);
    return {
      sessionId: s.bookingId,
      stage: s.stage,
      sosActive: s.sosActive,
      startAt: s.booking.startAt,
      endAt: s.booking.endAt,
      mode: s.booking.mode,
      subject: s.booking.subject,
      title: s.booking.title,
      state: s.booking.state,
      tutor: tutor ? { id: tutor.id, name: tutor.name, phone: tutor.phone ?? "", avatarColor: tutor.avatarColor } : { id: s.booking.tutorId, name: "Tutor", phone: "", avatarColor: "#315BE5" },
      student: student ? { id: student.id, name: student.name, avatarColor: student.avatarColor } : { id: s.booking.studentId, name: "Student", avatarColor: "#F47B20" },
      destArea: s.destArea,
      dest: { lat: s.destLat, lng: s.destLng },
      route: JSON.parse(s.routeJson || "[]") as { lat: number; lng: number }[],
      checkedInAt: s.checkedInAt,
      checkedOutAt: s.checkedOutAt,
      onMyWayAt: s.onMyWayAt,
    };
  });
  return Response.json({ data });
}
