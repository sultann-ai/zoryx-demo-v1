import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Prisma } from "../../../generated/prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";

export interface CustomerAuthResult {
  token: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
  };
}

export interface SignupInput {
  name: string;
  phone: string;
  password: string;
  email?: string;
}

function signCustomerToken(customerId: string): string {
  return jwt.sign({ id: customerId, type: "customer" }, env.JWT_SECRET, { expiresIn: "30d" });
}

export async function signup(input: SignupInput): Promise<CustomerAuthResult> {
  const passwordHash = await bcrypt.hash(input.password, 10);

  const customer = await prisma.customer.create({
    data: {
      name: input.name,
      phone: input.phone,
      passwordHash,
      ...(input.email !== undefined ? { email: input.email } : {}),
    },
  });

  return {
    token: signCustomerToken(customer.id),
    customer: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email },
  };
}

export async function login(phone: string, password: string): Promise<CustomerAuthResult | null> {
  const customer = await prisma.customer.findUnique({ where: { phone } });
  if (!customer) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, customer.passwordHash);
  if (!passwordMatches) {
    return null;
  }

  return {
    token: signCustomerToken(customer.id),
    customer: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email },
  };
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
