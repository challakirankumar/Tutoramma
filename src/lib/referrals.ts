import { db } from "@/lib/db";

const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const REFERRAL_CREDIT = 20000; // ₹200 in paise, to each side

/** Returns (creating once) the user's shareable referral code, e.g. "AMMA-K7Q2RX". */
export async function referralCodeFor(userId: string): Promise<string> {
  const existing = await db.referralCode.findUnique({ where: { userId } });
  if (existing) return existing.code;
  for (let i = 0; i < 5; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = "AMMA-" + Array.from(bytes, (b) => ALPHA[b % ALPHA.length]).join("");
    if (!(await db.referralCode.findUnique({ where: { code } }))) {
      await db.referralCode.create({ data: { userId, code } });
      return code;
    }
  }
  throw new Error("Could not allocate a referral code");
}

async function credit(userId: string, amount: number) {
  const w = await db.wallet.findUnique({ where: { userId } });
  if (w) await db.wallet.update({ where: { userId }, data: { available: w.available + amount } });
  else await db.wallet.create({ data: { userId, available: amount } });
}

/** Applies a referral at sign-up: one credit per new account, never self-referral. */
export async function applyReferral(newUserId: string, code: string): Promise<boolean> {
  const rc = await db.referralCode.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!rc || rc.userId === newUserId) return false;
  if (await db.referral.findUnique({ where: { referredId: newUserId } })) return false;
  await db.referral.create({ data: { referrerId: rc.userId, referredId: newUserId, code: rc.code, credit: REFERRAL_CREDIT } });
  await credit(rc.userId, REFERRAL_CREDIT);
  await credit(newUserId, REFERRAL_CREDIT);
  const newbie = await db.user.findUnique({ where: { id: newUserId }, select: { name: true } });
  await db.notification.createMany({
    data: [
      { userId: rc.userId, title: "You earned ₹200 🎁", body: `${newbie?.name ?? "A friend"} joined Tutor Amma with your code. Credit added to your wallet.`, type: "payment" },
      { userId: newUserId, title: "Welcome credit ₹200 🎁", body: "Your referral credit is in your wallet — use it on your first booking.", type: "payment" },
    ],
  });
  return true;
}
