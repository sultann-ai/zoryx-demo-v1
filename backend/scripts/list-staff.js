// Lists staff usernames/roles so you can see who exists without exposing password
// hashes (which are one-way anyway — use create-admin.js to reset a password instead).
// Run wherever you want to check: locally, or in Railway's Console tab for production.
require("dotenv").config();
const { PrismaClient } = require("../dist/generated/prisma/client");

const prisma = new PrismaClient();

async function main() {
  const staff = await prisma.staffUser.findMany({
    select: { username: true, name: true, role: true, isActive: true, kitchenId: true },
    orderBy: { username: "asc" },
  });

  if (staff.length === 0) {
    console.log("No staff users exist yet.");
    return;
  }

  for (const s of staff) {
    console.log(`${s.username}\t${s.name}\t${s.role}\t${s.isActive ? "active" : "INACTIVE"}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
