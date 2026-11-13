import { db } from "@/lib/db";
import { hashPassword, signToken, SESSION_COOKIE } from "@/lib/auth";
import { hashPassword as hp } from "@/lib/auth";

const ROLES = ["student", "parent", "tutor", "institute", "admin"];
const AVATAR_COLORS: Record<string, string> = { student: "#F47B20", parent: "#1F9D68", tutor: "#315BE5", institute: "#7C4D2A", admin: "#14246B" };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { role, name, email, password, phone } = body;
    if (!ROLES.includes(role)) {
      return Response.json({ error: { code: "VALIDATION_ERROR", message: "Choose a valid role." } }, { status: 422 });
    }
    if (!name || !email || !password) {
      return Response.json({ error: { code: "VALIDATION_ERROR", message: "Name, email and password are required." } }, { status: 422 });
    }
    if (String(password).length < 6) {
      return Response.json({ error: { code: "VALIDATION_ERROR", message: "Password must be at least 6 characters." } }, { status: 422 });
    }
    const emailNorm = String(email).toLowerCase().trim();
    const exists = await db.user.findUnique({ where: { email: emailNorm } });
    if (exists) {
      return Response.json({ error: { code: "DUPLICATE_REQUEST", message: "An account with this email already exists." } }, { status: 409 });
    }
    const user = await db.user.create({
      data: {
        email: emailNorm,
        password: hp(String(password)),
        name: String(name).trim(),
        role: String(role),
        phone: phone ? String(phone) : null,
        avatarColor: AVATAR_COLORS[role],
      },
    });
    if (role === "student") {
      await db.studentProfile.create({
        data: { userId: user.id, grade: "Grade 8", boardId: "CBSE", school: "", parentEmail: body.parentEmail || null },
      });
    } else if (role === "parent") {
      await db.parentProfile.create({
        data: { userId: user.id, consents: JSON.stringify({ location: true, recording: false, messageVisibility: true, whatsapp: true }) },
      });
    } else if (role === "tutor") {
      await db.tutorProfile.create({
        data: {
          userId: user.id, headline: "New tutor — profile in setup", status: "draft",
          modes: JSON.stringify(["online"]), languages: JSON.stringify(["English"]),
        },
      });
    } else if (role === "institute") {
      await db.instituteProfile.create({
        data: { userId: user.id, academyName: String(name).trim(), verified: false },
      });
    }
    await db.notification.create({
      data: {
        userId: user.id,
        title: "Welcome to Tutor Amma! 🎉",
        body:
          role === "tutor"
            ? "Complete your profile verification to start receiving bookings. Background check unlocks home tuition."
            : role === "parent"
            ? "Add your children, browse verified tutors and book with escrow-protected payments."
            : role === "institute"
            ? "Set up your academy profile, add batches and invite tutors to start managing your institute."
            : role === "admin"
            ? "You now have access to the operations console."
            : "Find tutors matched to your curriculum and start learning today.",
        type: "system",
      },
    });
    const res = Response.json({
      data: { id: user.id, name: user.name, email: user.email, role: user.role, avatarColor: user.avatarColor, isDemo: false },
    });
    res.headers.append(
      "Set-Cookie",
      `${SESSION_COOKIE}=${signToken(user.id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`
    );
    return res;
  } catch (e) {
    return Response.json({ error: { code: "VALIDATION_ERROR", message: "Could not create account." } }, { status: 422 });
  }
}
