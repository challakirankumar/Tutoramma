import { createHmac, randomBytes, createHash } from "crypto"
import { cookies } from "next/headers"
import { db } from "@/lib/db"

const SECRET = process.env.AUTH_SECRET || "tutor-amma-key-to-success-secret-2026"

export function hashPassword(password: string): string {
  return createHash("sha256").update(`${SECRET}:${password}`).digest("hex")
}

export function signToken(userId: string): string {
  const sig = createHmac("sha256", SECRET).update(userId).digest("hex").slice(0, 32)
  return `${userId}.${sig}`
}

export function verifyToken(token: string): string | null {
  const idx = token.lastIndexOf(".")
  if (idx < 0) return null
  const userId = token.slice(0, idx)
  const sig = token.slice(idx + 1)
  const expected = createHmac("sha256", SECRET).update(userId).digest("hex").slice(0, 32)
  if (sig !== expected) return null
  return userId
}

export const SESSION_COOKIE = "ta_session"

export interface AuthUser {
  id: string
  name: string
  email: string
  role: string
  avatarColor: string
  isDemo: boolean
}

export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    if (!token) return null
    const userId = verifyToken(token)
    if (!userId) return null
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, avatarColor: true, isDemo: true, status: true },
    })
    if (!user || user.status !== "active") return null
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarColor: user.avatarColor,
      isDemo: user.isDemo,
    }
  } catch {
    return null
  }
}

export function unauthorized() {
  return Response.json({ error: { code: "UNAUTHENTICATED", message: "Please sign in to continue." } }, { status: 401 })
}

export function forbidden(message = "You do not have permission to perform this action.") {
  return Response.json({ error: { code: "FORBIDDEN", message } }, { status: 403 })
}

export function badRequest(message: string, code = "VALIDATION_ERROR", fields?: Record<string, string>) {
  return Response.json({ error: { code, message, fields } }, { status: code === "SLOT_TAKEN" || code === "INVALID_STATE" ? 409 : 422 })
}

export function notFound(message = "Resource not found.") {
  return Response.json({ error: { code: "NOT_FOUND", message } }, { status: 404 })
}

export async function audit(actor: { name: string; role: string }, action: string, resource: string, detail = "", severity = "info") {
  await db.auditEvent.create({
    data: { actorName: actor.name, actorRole: actor.role, action, resource, detail, severity },
  })
}
