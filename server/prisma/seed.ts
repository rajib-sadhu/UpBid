import { Role, UserStatus } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";

// Standard football formations. numGK + numDef + numMid + numFwd must equal 11
// (the default startingSize). "4-2-3-1" folds its 2-defensive + 3-attacking
// midfielders into numMid = 5; "4-5-1" likewise.
const FORMATIONS = [
  { name: "4-4-2", numGK: 1, numDef: 4, numMid: 4, numFwd: 2 },
  { name: "4-3-3", numGK: 1, numDef: 4, numMid: 3, numFwd: 3 },
  { name: "3-5-2", numGK: 1, numDef: 3, numMid: 5, numFwd: 2 },
  { name: "4-2-3-1", numGK: 1, numDef: 4, numMid: 5, numFwd: 1 },
  { name: "5-3-2", numGK: 1, numDef: 5, numMid: 3, numFwd: 2 },
  { name: "4-5-1", numGK: 1, numDef: 4, numMid: 5, numFwd: 1 },
] as const;

async function main(): Promise<void> {
  // Guard: every formation must field exactly 11.
  for (const f of FORMATIONS) {
    const total = f.numGK + f.numDef + f.numMid + f.numFwd;
    if (total !== 11) {
      throw new Error(`Formation ${f.name} sums to ${total}, expected 11`);
    }
  }

  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in the environment");
  }

  const passwordHash = await hashPassword(password);
  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash,
    },
    create: {
      email,
      name: "Super Admin",
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash,
      activatedAt: new Date(),
    },
  });
  console.log(`✓ super admin: ${admin.email}`);

  for (const f of FORMATIONS) {
    await prisma.formation.upsert({
      where: { name: f.name },
      update: { numGK: f.numGK, numDef: f.numDef, numMid: f.numMid, numFwd: f.numFwd },
      create: { ...f },
    });
  }
  console.log(`✓ ${FORMATIONS.length} football formations`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err: unknown) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
