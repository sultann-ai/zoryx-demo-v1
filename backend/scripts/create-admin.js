// One-off script to create or reset a staff account.
// Run inside the deployed environment (e.g. Railway's Console tab) so it uses
// that environment's DATABASE_URL: node scripts/create-admin.js
//
// Override the defaults via env vars if you don't want to hardcode a password
// in your shell history: ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_NAME, ADMIN_ROLE,
// and ADMIN_KITCHEN_ID (required for a kitchen account).
require("dotenv").config();
const bcrypt = require("bcrypt");
const { PrismaClient } = require("../dist/generated/prisma/client");

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const name = process.env.ADMIN_NAME || "Admin";
  const role = process.env.ADMIN_ROLE || "SUPER_ADMIN";
  const kitchenId = process.env.ADMIN_KITCHEN_ID || undefined;
  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters");
  }
  const validRoles = ["SUPER_ADMIN", "POS_ADMIN", "ONLINE_ADMIN", "KITCHEN", "ORDER_TAKER"];

  if (!validRoles.includes(role)) {
    throw new Error(`ADMIN_ROLE must be one of: ${validRoles.join(", ")}`);
  }
  if (role === "KITCHEN" && !kitchenId) {
    throw new Error("ADMIN_KITCHEN_ID is required when ADMIN_ROLE is KITCHEN");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const staff = await prisma.staffUser.upsert({
    where: { username },
    update: {
      passwordHash,
      isActive: true,
      name,
      role,
      ...(kitchenId !== undefined ? { kitchenId } : {}),
    },
    create: {
      username,
      passwordHash,
      name,
      role,
      isActive: true,
      ...(kitchenId !== undefined ? { kitchenId } : {}),
    },
  });

  console.log(`Staff user ready: username="${staff.username}" role=${staff.role}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
