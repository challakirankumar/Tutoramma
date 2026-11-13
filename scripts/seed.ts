import { seedDemoData } from "../src/lib/seed";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const res = await seedDemoData();
  console.log("✅ Tutor Amma demo data seeded:", res);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
