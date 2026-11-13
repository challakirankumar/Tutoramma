import { db } from "@/lib/db";
import { levelForXp } from "@/lib/learning";

/** Adds XP to a student's profile (no-op for other roles). Returns the new totals. */
export async function awardXp(userId: string, amount: number): Promise<{ xp: number; level: number; levelUp: boolean } | null> {
  if (amount <= 0) return null;
  const profile = await db.studentProfile.findUnique({ where: { userId }, select: { id: true, xp: true, level: true } });
  if (!profile) return null;
  const xp = profile.xp + Math.round(amount);
  const level = Math.max(profile.level, levelForXp(xp));
  await db.studentProfile.update({ where: { id: profile.id }, data: { xp, level } });
  return { xp, level, levelUp: level > profile.level };
}

export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}
