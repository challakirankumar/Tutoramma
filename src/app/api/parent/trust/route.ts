import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth";

/**
 * Parent Trust Dashboard (spec §30): verification proofs of every tutor who
 * teaches the family, plus visit history with check-in / check-out logs.
 * Documents themselves stay private — only their verified status and date.
 */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "parent") return forbidden();
  const kids = await db.studentProfile.findMany({ where: { parentEmail: auth.email }, select: { userId: true } });
  const childIds = kids.map((k) => k.userId);
  const bookings = await db.booking.findMany({ where: { studentId: { in: childIds } }, select: { id: true, tutorId: true, studentId: true, subject: true, mode: true, startAt: true, endAt: true, state: true } });
  const tutorIds = [...new Set(bookings.map((b) => b.tutorId))];
  const profilesFirst = await db.tutorProfile.findMany({ where: { userId: { in: tutorIds } } });
  const [users, profiles, docs, sessions, alerts] = await Promise.all([
    db.user.findMany({ where: { id: { in: [...tutorIds, ...childIds] } }, select: { id: true, name: true, avatarColor: true } }),
    Promise.resolve(profilesFirst),
    /* TutorDocument.tutorId references the TutorProfile id */
    db.tutorDocument.findMany({ where: { tutorId: { in: profilesFirst.map((p) => p.id) } } }),
    db.homeSession.findMany({ where: { bookingId: { in: bookings.map((b) => b.id) } } }),
    db.alertEvent.findMany({ where: { sessionId: { in: bookings.map((b) => b.id) } } }),
  ]);
  const name = (id: string) => users.find((u) => u.id === id)?.name ?? "—";
  const parse = (s: string) => {
    try {
      return JSON.parse(s);
    } catch {
      return [];
    }
  };
  const DOC_LABEL: Record<string, string> = { civil_id: "Identity verified", degree: "Qualification verified", teaching_cert: "Teaching certificate", background_check: "Police verification", conduct: "Code of conduct signed" };

  const tutors = tutorIds.map((id) => {
    const p = profiles.find((x) => x.userId === id);
    const exp = parse(p?.experience ?? "[]") as { role: string; org: string; verified?: boolean }[];
    return {
      id,
      name: name(id),
      color: users.find((u) => u.id === id)?.avatarColor ?? "#315BE5",
      headline: p?.headline ?? "",
      status: p?.status ?? "draft",
      rating: p?.rating ?? 0,
      reviews: p?.reviewCount ?? 0,
      sessionsDone: p?.sessionsDone ?? 0,
      trustScore: p?.trustScore ?? 0,
      badges: parse(p?.badges ?? "[]") as string[],
      proofs: docs.filter((d) => d.tutorId === p?.id).map((d) => ({ label: DOC_LABEL[d.type] ?? d.name, issuer: d.issuer, status: d.status, at: d.uploadedAt })),
      experience: exp.map((e) => ({ role: e.role, org: e.org, confirmed: !!e.verified })),
      subjects: [...new Set(bookings.filter((b) => b.tutorId === id).map((b) => b.subject))],
      sessionsWithFamily: bookings.filter((b) => b.tutorId === id && b.state === "completed").length,
    };
  });

  const visits = sessions
    .map((s) => {
      const b = bookings.find((x) => x.id === s.bookingId)!;
      const mins = s.checkedInAt && s.checkedOutAt ? Math.round((s.checkedOutAt.getTime() - s.checkedInAt.getTime()) / 60000) : null;
      return {
        id: s.id,
        bookingId: s.bookingId,
        tutor: name(b.tutorId),
        child: name(b.studentId),
        subject: b.subject,
        area: s.destArea,
        scheduled: b.startAt,
        stage: s.stage,
        onMyWayAt: s.onMyWayAt,
        checkedInAt: s.checkedInAt,
        checkedOutAt: s.checkedOutAt,
        minutes: mins,
        bookedMinutes: Math.round((b.endAt.getTime() - b.startAt.getTime()) / 60000),
        alerts: alerts.filter((a) => a.sessionId === b.id).map((a) => ({ type: a.type, message: a.message, at: a.createdAt })),
        sos: s.sosActive || alerts.some((a) => a.sessionId === b.id && a.type === "sos"),
      };
    })
    .sort((a, b) => new Date(b.scheduled).getTime() - new Date(a.scheduled).getTime());

  const done = visits.filter((v) => v.checkedOutAt);
  return Response.json({
    data: {
      tutors,
      visits,
      summary: {
        verifiedTutors: tutors.filter((t) => t.status === "approved").length,
        totalTutors: tutors.length,
        visits: visits.length,
        otpCompliance: (() => {
          const started = visits.filter((v) => v.stage === "in_progress" || v.stage === "done");
          return started.length ? Math.round((started.filter((v) => v.checkedInAt).length / started.length) * 100) : null;
        })(),
        avgMinutes: done.length ? Math.round(done.reduce((a, v) => a + (v.minutes ?? 0), 0) / done.length) : null,
        alerts: visits.reduce((a, v) => a + v.alerts.length, 0),
      },
    },
  });
}
