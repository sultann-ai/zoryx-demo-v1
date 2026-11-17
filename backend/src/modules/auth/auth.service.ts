import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { StaffRole } from "../../../generated/prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";

export interface LoginResult {
  token: string;
  staff: {
    id: string;
    name: string;
    username: string;
    role: StaffRole;
    kitchenId: string | null;
  };
}

export async function login(username: string, password: string): Promise<LoginResult | null> {
  const staffUser = await prisma.staffUser.findUnique({ where: { username } });

  if (!staffUser || !staffUser.isActive) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, staffUser.passwordHash);
  if (!passwordMatches) {
    return null;
  }

  const token = jwt.sign(
    { id: staffUser.id, role: staffUser.role, kitchenId: staffUser.kitchenId },
    env.JWT_SECRET,
    { expiresIn: "12h" },
  );

  return {
    token,
    staff: {
      id: staffUser.id,
      name: staffUser.name,
      username: staffUser.username,
      role: staffUser.role,
      kitchenId: staffUser.kitchenId,
    },
  };
}
