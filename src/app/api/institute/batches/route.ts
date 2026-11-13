import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, badRequest, audit } from "@/lib/auth";

/** GET /api/institute/batches — the academy's group batches. */
const BOARDS = ["CBSE", "ICSE", "IGCSE", "IB-MYP", "AMERICAN", "TN-STATE"];
const GRADES = ["Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10"];
const STATUS_ORDER: Record<string, number> = { open: 0, confirmed: 1, closed: 2 };

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "institute") return forbidden("Institute access only.");

  const batches = await db.batch.findMany({ where: { instituteEmail: auth.email } });
  const tutorIds = Array.from(new Set(batches.map((b) => b.tutorId)));
  const tutors = tutorIds.length
    ? await db.user.findMany({ where: { id: { in: tutorIds } }, select: { id: true, name: true, avatarColor: true } })
    : [];
  const tutorMap = new Map(tutors.map((t) => [t.id, t]));

  const data = batches
    .map((b) => {
      const t = tutorMap.get(b.tutorId);
      return {
        id: b.id,
        title: b.title,
        subject: b.subject,
        board: b.board,
        grade: b.grade,
        tutorId: b.tutorId,
        tutorName: t?.name ?? "Tutor",
        tutorColor: t?.avatarColor ?? "#315BE5",
        schedule: b.schedule,
        dayPattern: JSON.parse(b.dayPattern || "[]"),
        minSeats: b.minSeats,
        maxSeats: b.maxSeats,
        seatsFilled: b.seatsFilled,
        pricePerSeat: b.pricePerSeat,
        mode: b.mode,
        venue: b.venue,
        status: b.status,
        startDate: b.startDate,
        rating: b.rating,
        instituteOwned: true,
      };
    })
    .sort(
      (a, b) =>
        (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3) ||
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );

  return Response.json({ data });
}

/** POST /api/institute/batches — create a new academy batch (opens for seat bookings). */
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "institute") return forbidden("Institute access only.");

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return badRequest("Invalid request body.");

  const tutorId = typeof body.tutorId === "string" ? body.tutorId : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const board = typeof body.board === "string" ? body.board : "";
  const grade = typeof body.grade === "string" ? body.grade : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const schedule = typeof body.schedule === "string" ? body.schedule.trim() : "";
  const mode = typeof body.mode === "string" ? body.mode : "online";
  const venue = typeof body.venue === "string" ? body.venue.trim() : "";

  /* the tutor must belong to this academy */
  const tutor = await db.tutorProfile.findFirst({ where: { userId: tutorId, instituteEmail: auth.email } });
  if (!tutor) return badRequest("Tutor must belong to your academy.");

  if (!title || !subject || !board || !grade) return badRequest("Title, subject, board and grade are required.");
  if (!BOARDS.includes(board)) return badRequest("Unsupported board.");
  if (!GRADES.includes(grade)) return badRequest("Grade must be between Grade 6 and Grade 10.");
  if (!schedule) return badRequest("A schedule description is required (e.g. “Tuesdays 17:00–18:15”).");
  if (mode !== "online" && mode !== "venue") return badRequest("Mode must be online or venue.");
  if (mode === "venue" && !venue) return badRequest("Venue address is required for venue batches.");

  const minSeats = Number(body.minSeats ?? 4);
  const maxSeats = Number(body.maxSeats ?? 12);
  if (!Number.isInteger(minSeats) || minSeats < 1 || minSeats > 30) return badRequest("Minimum seats must be between 1 and 30.");
  if (!Number.isInteger(maxSeats) || maxSeats < minSeats || maxSeats > 60)
    return badRequest("Maximum seats must be at least the minimum and at most 60.");

  const pricePaise = Math.round(Number(body.pricePerSeat) * 100);
  if (!Number.isFinite(pricePaise) || pricePaise < 25000 || pricePaise > 1000000)
    return badRequest("Price per seat must be between ₹250 and ₹10,000.");

  /* optional day pattern: [{ day: 0-6, start, end }] in minutes */
  let pattern: unknown[] = [];
  if (body.dayPattern != null) {
    if (
      !Array.isArray(body.dayPattern) ||
      !body.dayPattern.every(
        (p) =>
          p &&
          typeof p === "object" &&
          Number.isInteger((p as { day?: unknown }).day) &&
          (p as { day: number }).day >= 0 &&
          (p as { day: number }).day <= 6 &&
          Number.isFinite((p as { start?: unknown }).start) &&
          Number.isFinite((p as { end?: unknown }).end) &&
          (p as { end: number }).end > (p as { start: number }).start
      )
    ) {
      return badRequest("Day pattern must be a list of { day, start, end } (minutes).");
    }
    pattern = body.dayPattern;
  }

  const batch = await db.batch.create({
    data: {
      tutorId,
      instituteEmail: auth.email,
      subject,
      board,
      grade,
      title,
      schedule,
      dayPattern: JSON.stringify(pattern),
      minSeats,
      maxSeats,
      seatsFilled: 0,
      pricePerSeat: pricePaise,
      mode,
      venue: mode === "venue" ? venue : null,
      status: "open",
      startDate: new Date(),
      rating: 0,
    },
  });

  await db.notification.create({
    data: {
      userId: auth.id,
      title: "Batch created",
      body: `${title} is live and open for seat bookings. It confirms at ${minSeats} seats — share the batch link to fill them.`,
      type: "system",
    },
  });
  await audit({ name: auth.name, role: auth.role }, "institute.batch.created", `Batch: ${title}`, `${board} · ${grade} · ${subject} · ${schedule}`);

  return Response.json({ data: batch }, { status: 201 });
}
