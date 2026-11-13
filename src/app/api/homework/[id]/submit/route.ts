import { db } from "@/lib/db";
import { getAuthUser, unauthorized, forbidden, notFound, badRequest, audit } from "@/lib/auth";

/**
 * POST /api/homework/[id]/submit — body { answers: string[], text?: string }
 * Auto-grades when every question has an `answer` key (MCQ letter match):
 * score %, status "graded", XP award + level recompute, TestResult, tutor notification.
 * Otherwise the submission lands as "submitted" for tutor review.
 * Batch homework is graded on the student's own copy.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser();
  if (!auth) return unauthorized();
  if (auth.role !== "student") return forbidden("Only students can submit homework.");
  const { id } = await params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }
  const answers: string[] = Array.isArray(body?.answers) ? body.answers : [];
  const text: string | undefined = typeof body?.text === "string" ? body.text : undefined;

  const hw = await db.homework.findUnique({ where: { id } });
  if (!hw) return notFound("Homework not found.");

  let target = hw;
  if (hw.studentId !== auth.id && hw.batchId) {
    const seat = await db.batchSeat.findFirst({ where: { batchId: hw.batchId, studentId: auth.id } });
    if (!seat) return forbidden("This homework is not assigned to you.");
    /* grade a personal copy so the batch template stays available to others */
    target = await db.homework.create({
      data: {
        tutorId: hw.tutorId,
        studentId: auth.id,
        batchId: hw.batchId,
        title: hw.title,
        subject: hw.subject,
        dueAt: hw.dueAt,
        xp: hw.xp,
        status: "assigned",
        questionsJson: hw.questionsJson,
      },
    });
  } else if (hw.studentId !== auth.id) {
    return forbidden("This homework is not assigned to you.");
  }

  if (target.status === "graded") {
    return Response.json(
      { error: { code: "INVALID_STATE", message: "This homework is already graded." } },
      { status: 409 }
    );
  }

  const questions: any[] = JSON.parse(target.questionsJson || "[]");
  const submission = JSON.stringify({ answers, text: text ?? null, at: new Date().toISOString() });

  /* ---- auto-grade path (quick test with answer keys) ---- */
  const autoGradable = questions.length > 0 && questions.every((q) => q && typeof q.answer === "string");

  if (autoGradable) {
    let correct = 0;
    const wrongTopics: string[] = [];
    questions.forEach((q, i) => {
      const given = (answers[i] ?? "").toString().trim().toUpperCase();
      const expected = (q.answer ?? "").toString().trim().toUpperCase();
      if (given === expected) correct += 1;
      else wrongTopics.push(q.chapter || q.topic || `Question ${i + 1}`);
    });
    const pct = Math.round((correct / questions.length) * 100);

    const updated = await db.homework.update({
      where: { id: target.id },
      data: {
        status: "graded",
        score: pct,
        feedback: "Auto-graded — tutor will review",
        submission,
      },
    });

    /* XP + level (level = floor(xp / 400) + 1) */
    const profile = await db.studentProfile.findUnique({ where: { userId: auth.id } });
    const newXp = (profile?.xp ?? 0) + target.xp;
    const newLevel = Math.floor(newXp / 400) + 1;
    if (profile) {
      await db.studentProfile.update({ where: { id: profile.id }, data: { xp: newXp, level: newLevel } });
    }

    await db.testResult.create({
      data: {
        studentId: auth.id,
        title: target.title,
        subject: target.subject,
        score: correct,
        total: questions.length,
        xp: target.xp,
        weakTopics: JSON.stringify(wrongTopics),
      },
    });

    await db.notification.create({
      data: {
        userId: target.tutorId,
        title: "Homework submitted",
        body: `${auth.name} submitted “${target.title}” — auto-graded ${pct}% (${correct}/${questions.length}). Review the detailed answers in your homework inbox.`,
        type: "studio",
      },
    });
    await audit({ name: auth.name, role: auth.role }, "homework.submitted", `Homework: ${target.id}`, `Auto-graded ${pct}% · +${target.xp} XP`);

    return Response.json({
      data: {
        homework: updated,
        result: { autoGraded: true, correct, total: questions.length, pct, wrongTopics },
        xp: { awarded: target.xp, total: newXp, level: newLevel, leveledUp: newLevel > (profile?.level ?? 1) },
      },
    });
  }

  /* ---- plain submission path ---- */
  const updated = await db.homework.update({
    where: { id: target.id },
    data: { status: "submitted", submission },
  });
  await db.notification.create({
    data: {
      userId: target.tutorId,
      title: "Homework submitted",
      body: `${auth.name} submitted “${target.title}” — ready for your review and grading.`,
      type: "studio",
    },
  });
  await audit({ name: auth.name, role: auth.role }, "homework.submitted", `Homework: ${target.id}`, "Submitted for tutor review");

  return Response.json({ data: { homework: updated, result: { autoGraded: false }, xp: { awarded: 0 } } });
}
