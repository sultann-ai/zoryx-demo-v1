import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";

export interface CreateAddressInput {
  customerId: string;
  addressText: string;
  label?: string;
  isDefault?: boolean;
}

export interface UpdateAddressInput {
  label?: string | null;
  addressText?: string;
  isDefault?: boolean;
}

export function listAddresses(customerId: string) {
  return prisma.customerAddress.findMany({ where: { customerId } });
}

// Scopes the lookup by customerId in the query itself, not as an after-the-fact check,
// so a customer can never fetch/mutate another customer's address by guessing its id.
export function findOwnedAddress(id: string, customerId: string) {
  return prisma.customerAddress.findFirst({ where: { id, customerId } });
}

export function createAddress(data: CreateAddressInput) {
  return prisma.customerAddress.create({
    data: {
      customerId: data.customerId,
      addressText: data.addressText,
      ...(data.label !== undefined ? { label: data.label } : {}),
      ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
    },
  });
}

export function updateAddressById(id: string, data: UpdateAddressInput) {
  return prisma.customerAddress.update({
    where: { id },
    data: {
      ...(data.label !== undefined ? { label: data.label } : {}),
      ...(data.addressText !== undefined ? { addressText: data.addressText } : {}),
      ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
    },
  });
}

export function deleteAddressById(id: string) {
  return prisma.customerAddress.delete({ where: { id } });
}

export function isForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}
