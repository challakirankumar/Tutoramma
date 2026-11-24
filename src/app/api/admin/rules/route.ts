import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, notFound, audit } from "@/lib/auth";
import { DEFAULT_RULES, DEFAULT_GATES, evaluateGates, type Rule, type Gate } from "@/lib/rules-profile";

function shape(p: { id: string; country: string; version: number; status: string; rules: string; gates: string; notes: string; submittedBy: string | null; approvedBy: string | null; approvedAt: Date | null; updatedAt: Date }) {
  const rules = JSON.parse(p.rules) as Rule[];
  const gates = evaluateGates(p.status, rules, JSON.parse(p.gates) as Gate[]);
  return { ...p, rules, gates };
}

/** GET /api/admin/rules — all country RulesProfiles (newest first). Super admin only. */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden("Compliance & Rules is for the super admin.");
  const list = await db.rulesProfile.findMany({ orderBy: [{ country: "asc" }, { version: "desc" }] });
  return Response.json({ data: list.map(shape) });
}

/** POST /api/admin/rules — { country } creates the next draft version (cloned from the latest, or defaults). */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();
  let b: { country?: string };
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const country = String(b.country ?? "").trim().slice(0, 40);
  if (!country) return badRequest("Country is required.");
  const latest = await db.rulesProfile.findFirst({ where: { country }, orderBy: { version: "desc" } });
  const open = await db.rulesProfile.findFirst({ where: { country, status: { in: ["draft", "in_review"] } } });
  if (open) return badRequest(`${country} v${open.version} is still ${open.status.replace("_", " ")} — finish it first.`, "INVALID_STATE");
  const rules = latest ? (JSON.parse(latest.rules) as Rule[]).map((r) => ({ ...r, confirmed: r.confirmed })) : DEFAULT_RULES;
  const p = await db.rulesProfile.create({
    data: { country, version: (latest?.version ?? 0) + 1, status: "draft", rules: JSON.stringify(rules), gates: JSON.stringify(DEFAULT_GATES), notes: latest ? `Cloned from v${latest.version}` : "Conservative defaults" },
  });
  await audit({ name: auth.name, role: auth.role }, "rules.profile_created", `RulesProfile: ${country} v${p.version}`, p.notes);
  return Response.json({ data: shape(p) }, { status: 201 });
}

/**
 * PATCH /api/admin/rules — { id, rules? } edits a draft / in-review profile
 * (editing a value marks it unconfirmed), or { id, action: submit | approve | return }.
 * Approved profiles are immutable; bookings keep the version they used.
 */
export async function PATCH(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "admin") return forbidden();
  let b: { id?: string; rules?: { key: string; value?: string; confirmed?: boolean }[]; action?: string };
  try {
    b = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const p = await db.rulesProfile.findUnique({ where: { id: b.id ?? "" } });
  if (!p) return notFound("Profile not found.");
  if (p.status === "approved" || p.status === "superseded") return badRequest("Approved profiles are locked — create a new version to change rules.", "INVALID_STATE");

  let rules = JSON.parse(p.rules) as Rule[];
  if (b.rules?.length) {
    rules = rules.map((r) => {
      const u = b.rules!.find((x) => x.key === r.key);
      if (!u) return r;
      const value = u.value !== undefined ? String(u.value).slice(0, 120) : r.value;
      const changed = value !== r.value;
      return { ...r, value, confirmed: changed ? false : u.confirmed ?? r.confirmed };
    });
  }

  let status = p.status;
  let extra: Record<string, unknown> = {};
  if (b.action === "submit") {
    if (p.status !== "draft") return badRequest("Only drafts can be submitted.", "INVALID_STATE");
    status = "in_review";
    extra = { submittedBy: auth.name };
  } else if (b.action === "return") {
    status = "draft";
  } else if (b.action === "approve") {
    if (p.status !== "in_review") return badRequest("Submit the profile for legal review first.", "INVALID_STATE");
    const blank = rules.filter((r) => r.required && !r.value);
    if (blank.length) return badRequest(`Cannot approve: ${blank.map((r) => r.label).join(", ")} must be set.`, "RULE_FAILED");
    status = "approved";
    extra = { approvedBy: `Legal · ${auth.name}`, approvedAt: new Date() };
    await db.rulesProfile.updateMany({ where: { country: p.country, status: "approved", NOT: { id: p.id } }, data: { status: "superseded" } });
  }

  const updated = await db.rulesProfile.update({ where: { id: p.id }, data: { rules: JSON.stringify(rules), status, ...extra } });
  await audit(
    { name: auth.name, role: auth.role },
    b.action ? `rules.${b.action}` : "rules.edited",
    `RulesProfile: ${p.country} v${p.version}`,
    b.rules?.map((r) => `${r.key}=${r.value ?? ""}${r.confirmed ? " (confirmed)" : ""}`).join("; ") ?? status,
    b.action === "approve" ? "warning" : "info"
  );
  return Response.json({ data: shape(updated) });
}
