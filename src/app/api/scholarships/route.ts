import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

/**
 * Scholarship hours (spec §16, §30): tutors pledge free hours; parents apply
 * for a child; an admin allocates hours from a pledge transparently.
 *  GET   → tutor: own pledges · parent: own applications · admin: everything
 *  POST  → tutor { hours, subjects, note } pledge · parent { childId, subject, hours, reason } apply
 *  PATCH → admin { id, decision: approve|decline, pledgeId? }
 */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  const totals = await db.scholarshipPledge.aggregate({ _sum: { hours: true, hoursUsed: true }, _count: true });
  const summary = { pledged: totals._sum.hours ?? 0, used: totals._sum.hoursUsed ?? 0, pledges: totals._count };
  if (auth.role === "tutor") {
    const pledges = await db.scholarshipPledge.findMany({ where: { tutorId: auth.id }, orderBy: { createdAt: "desc" } });
    return Response.json({ data: { summary, pledges } });
  }
  if (auth.role === "parent") {
    const apps = await db.scholarshipApplication.findMany({ where: { parentId: auth.id }, orderBy: { createdAt: "desc" } });
    const kids = await db.studentProfile.findMany({ where: { parentEmail: auth.email }, select: { userId: true, grade: true } });
    const names = await db.user.findMany({ where: { id: { in: kids.map((k) => k.userId) } }, select: { id: true, name: true } });
    return Response.json({ data: { summary, applications: apps, children: kids.map((k) => ({ id: k.userId, grade: k.grade, name: names.find((n) => n.id === k.userId)?.name ?? "Child" })) } });
  }
  if (auth.role === "admin") {
    const [pledges, apps] = await Promise.all([db.scholarshipPledge.findMany({ orderBy: { createdAt: "desc" } }), db.scholarshipApplication.findMany({ orderBy: { createdAt: "desc" } })]);
    const ids = [...new Set([...pledges.map((p) => p.tutorId), ...apps.flatMap((a) => [a.parentId, a.childId])])];
    const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const n = (id: string) => users.find((u) => u.id === id)?.name ?? "—";
    return Response.json({ data: { summary, pledges: pledges.map((p) => ({ ...p, tutorName: n(p.tutorId), left: p.hours - p.hoursUsed })), applications: apps.map((a) => ({ ...a, parentName: n(a.parentId), childName: n(a.childId) })) } });
  }
  return forbidden();
}

export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  if (auth.role === "tutor") {
    const hours = Math.round(Number(b.hours));
    if (!(hours >= 1 && hours <= 200)) return badRequest("Pledge between 1 and 200 hours.");
    const p = await db.scholarshipPledge.create({ data: { tutorId: auth.id, hours, subjects: String(b.subjects ?? "").slice(0, 120), note: String(b.note ?? "").slice(0, 300) } });
    await audit({ name: auth.name, role: auth.role }, "scholarship.pledged", `Pledge: ${hours} h`, p.subjects);
    return Response.json({ data: p }, { status: 201 });
  }
  if (auth.role === "parent") {
    const childId = String(b.childId ?? "");
    const kid = await db.studentProfile.findFirst({ where: { userId: childId, parentEmail: auth.email } });
    if (!kid) return forbidden("Choose one of your children.");
    const hours = Math.round(Number(b.hours));
    const reason = String(b.reason ?? "").trim().slice(0, 800);
    if (!(hours >= 1 && hours <= 40)) return badRequest("Request between 1 and 40 hours.");
    if (reason.length < 20) return badRequest("Please tell us a little about why the hours would help (at least 20 characters).");
    const open = await db.scholarshipApplication.count({ where: { childId, status: "pending" } });
    if (open) return badRequest("There is already a pending application for this child.", "INVALID_STATE");
    const a = await db.scholarshipApplication.create({ data: { parentId: auth.id, childId, subject: String(b.subject ?? "Mathematics").slice(0, 40), hoursRequested: hours, reason } });
    const admins = await db.user.findMany({ where: { role: "admin" }, select: { id: true } });
    if (admins.length) await db.notification.createMany({ data: admins.map((x) => ({ userId: x.id, title: "New scholarship application", body: `${hours} h of ${a.subject} requested.`, type: "system" })) });
    return Response.json({ data: a }, { status: 201 });
  }
  return forbidden();
}

export async function PATCH(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();
  let b: { id?: string; decision?: string; pledgeId?: string };
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const a = await db.scholarshipApplication.findUnique({ where: { id: b.id ?? "" } });
  if (!a) return notFound("Application not found.");
  if (a.status !== "pending") return badRequest("Already decided.", "INVALID_STATE");
  if (b.decision === "approve") {
    const p = await db.scholarshipPledge.findUnique({ where: { id: b.pledgeId ?? "" } });
    if (!p) return badRequest("Choose a pledge to allocate hours from.");
    if (p.hours - p.hoursUsed < a.hoursRequested) return badRequest(`That pledge has only ${p.hours - p.hoursUsed} hours left.`, "INVALID_STATE");
    await db.scholarshipPledge.update({ where: { id: p.id }, data: { hoursUsed: p.hoursUsed + a.hoursRequested } });
    await db.scholarshipApplication.update({ where: { id: a.id }, data: { status: "approved", pledgeId: p.id, decidedBy: auth.name, decidedAt: new Date() } });
    await db.notification.createMany({
      data: [
        { userId: a.parentId, title: "Scholarship approved 🎓", body: `${a.hoursRequested} free hours of ${a.subject} are ready — the tutor will reach out to schedule.`, type: "booking" },
        { userId: p.tutorId, title: "Your scholarship hours are helping", body: `${a.hoursRequested} of your pledged hours were matched to a student for ${a.subject}.`, type: "system" },
      ],
    });
  } else if (b.decision === "decline") {
    await db.scholarshipApplication.update({ where: { id: a.id }, data: { status: "declined", decidedBy: auth.name, decidedAt: new Date() } });
    await db.notification.create({ data: { userId: a.parentId, title: "Scholarship update", body: "We couldn't match hours this round — your application stays on file for the next pledges.", type: "system" } });
  } else return badRequest("Unknown decision.");
  await audit({ name: auth.name, role: auth.role }, `scholarship.${b.decision}`, `Application: ${a.id}`, `${a.hoursRequested} h ${a.subject}`);
  return Response.json({ data: { ok: true } });
}
