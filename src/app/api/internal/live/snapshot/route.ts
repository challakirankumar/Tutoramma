import { db } from "@/lib/db";
import { NextRequest } from "next/server";

const SECRET = process.env.INTERNAL_SECRET || "amma-livehub-2026";

function authorized(req: NextRequest) {
  return req.headers.get("x-amma-internal") === SECRET;
}

/** LiveHub bootstraps its ephemeral session state from the DB via this endpoint. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: "forbidden" }, { status: 403 });
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return Response.json({ data: null });
  const hs = await db.homeSession.findUnique({
    where: { bookingId: sessionId },
    include: { booking: true },
  });
  if (!hs) return Response.json({ data: null });
  const b = hs.booking;
  const [tutor, studentProfile] = await Promise.all([
    db.user.findUnique({ where: { id: b.tutorId }, select: { name: true, phone: true } }),
    db.studentProfile.findUnique({ where: { userId: b.studentId } }),
  ]);
  const parent = studentProfile?.parentEmail
    ? await db.user.findUnique({ where: { email: studentProfile.parentEmail }, select: { name: true, phone: true } })
    : null;
  return Response.json({
    data: {
      stage: hs.stage,
      battery: hs.battery,
      route: JSON.parse(hs.routeJson || "[]"),
      dest: { lat: hs.destLat, lng: hs.destLng },
      destArea: hs.destArea,
      /* LearnX safety spec — real session window + geofence for the alert-rule engine */
      homeSessionId: hs.id,
      geofenceMeters: hs.geofenceMeters,
      startAt: b.startAt,
      endAt: b.endAt,
      tutorName: tutor?.name ?? "Tutor",
      tutorPhone: tutor?.phone ?? "",
      studentName: studentProfile ? (await db.user.findUnique({ where: { id: b.studentId }, select: { name: true } }))?.name ?? "Student" : "Student",
      parentName: parent?.name ?? "Parent",
      parentPhone: parent?.phone ?? "",
      subject: b.subject,
      title: b.title,
    },
  });
}
