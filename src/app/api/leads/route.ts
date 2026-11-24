import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";

const ROLES = ["parent", "student", "tutor", "institute", "school"];
const STATUSES = ["new", "contacted", "demo_booked", "won", "closed"];

/** POST /api/leads — public demo request from the home page. */
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const s = (k: string, max: number) => String(b[k] ?? "").trim().slice(0, max);
  const name = s("name", 80);
  const email = s("email", 120).toLowerCase();
  const phone = s("phone", 20).replace(/[^\d+ ]/g, "");
  if (name.length < 2) return badRequest("Please enter your name.", "VALIDATION_ERROR", { name: "Required" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return badRequest("Please enter a valid email.", "VALIDATION_ERROR", { email: "Invalid" });
  if (phone.replace(/\D/g, "").length < 10) return badRequest("Please enter a 10-digit mobile number.", "VALIDATION_ERROR", { phone: "Invalid" });

  /* soft duplicate guard: the same person within 10 minutes is one request */
  const recent = await db.lead.findFirst({ where: { email, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } } });
  if (recent) return Response.json({ data: { id: recent.id, duplicate: true } });

  const lead = await db.lead.create({
    data: {
      name,
      email,
      phone,
      city: s("city", 60),
      role: ROLES.includes(s("role", 20)) ? s("role", 20) : "parent",
      board: s("board", 20),
      grade: s("grade", 20),
      message: s("message", 1000),
      source: s("source", 30) || "home",
    },
  });
  const admins = await db.user.findMany({ where: { role: "admin" }, select: { id: true } });
  if (admins.length) {
    await db.notification.createMany({
      data: admins.map((a) => ({ userId: a.id, title: `New demo request · ${lead.role}`, body: `${lead.name}${lead.city ? ` (${lead.city})` : ""} — ${lead.board} ${lead.grade}. ${lead.message.slice(0, 120)}`, type: "system" })),
    });
  }
  return Response.json({ data: { id: lead.id } }, { status: 201 });
}

/** GET /api/leads — admin inbox. */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();
  const leads = await db.lead.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
  return Response.json({ data: leads });
}

/** PATCH /api/leads — { id, status?, note? } */
export async function PATCH(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();
  let b: { id?: string; status?: string; note?: string };
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const lead = await db.lead.findUnique({ where: { id: b.id ?? "" } });
  if (!lead) return notFound("Lead not found.");
  const data: Record<string, string> = {};
  if (b.status && STATUSES.includes(b.status)) data.status = b.status;
  if (typeof b.note === "string") data.note = b.note.slice(0, 1000);
  const u = await db.lead.update({ where: { id: lead.id }, data });
  await audit({ name: auth.name, role: auth.role }, "lead.updated", `Lead: ${lead.name}`, JSON.stringify(data));
  return Response.json({ data: u });
}
