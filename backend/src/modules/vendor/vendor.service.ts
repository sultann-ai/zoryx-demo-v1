import { Prisma, VendorLedgerEntryType } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";

export interface CreateVendorInput {
  name: string;
  contactPerson?: string;
  phone?: string;
  address?: string;
  isActive?: boolean;
}

export interface UpdateVendorInput {
  name?: string;
  contactPerson?: string | null;
  phone?: string | null;
  address?: string | null;
  isActive?: boolean;
}

export interface CreateLedgerEntryInput {
  type: VendorLedgerEntryType;
  amount: Prisma.Decimal;
  description?: string;
  date: Date;
  recordedById: string;
}

export class VendorNotFoundError extends Error {}

// Balance is computed on read (sum of PURCHASE minus sum of PAYMENT), never cached, so
// it can never drift from the ledger entries themselves.
function balanceFromEntries(entries: { type: VendorLedgerEntryType; amount: Prisma.Decimal }[]): Prisma.Decimal {
  return entries.reduce((balance, entry) => {
    return entry.type === VendorLedgerEntryType.PURCHASE ? balance.plus(entry.amount) : balance.minus(entry.amount);
  }, new Prisma.Decimal(0));
}

export async function listVendors() {
  const vendors = await prisma.vendor.findMany({
    include: { ledgerEntries: { select: { type: true, amount: true } } },
    orderBy: { name: "asc" },
  });
  return vendors.map(({ ledgerEntries, ...vendor }) => ({
    ...vendor,
    balance: balanceFromEntries(ledgerEntries),
  }));
}

export function getVendorById(id: string) {
  return prisma.vendor.findUnique({ where: { id } });
}

export function vendorExists(id: string) {
  return prisma.vendor.findUnique({ where: { id }, select: { id: true } }).then(Boolean);
}

export function createVendor(data: CreateVendorInput) {
  return prisma.vendor.create({
    data: {
      name: data.name,
      ...(data.contactPerson !== undefined ? { contactPerson: data.contactPerson } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
}

export function updateVendor(id: string, data: UpdateVendorInput) {
  return prisma.vendor.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.contactPerson !== undefined ? { contactPerson: data.contactPerson } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
}

export function deleteVendor(id: string) {
  return prisma.vendor.delete({ where: { id } });
}

const ledgerEntryInclude = {
  recordedBy: { select: { id: true, name: true } },
} satisfies Prisma.VendorLedgerEntryInclude;

export async function getLedger(vendorId: string) {
  const entries = await prisma.vendorLedgerEntry.findMany({
    where: { vendorId },
    include: ledgerEntryInclude,
    orderBy: { date: "desc" },
  });
  return { entries, balance: balanceFromEntries(entries) };
}

export async function addLedgerEntry(vendorId: string, data: CreateLedgerEntryInput) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true } });
  if (!vendor) {
    throw new VendorNotFoundError();
  }

  return prisma.vendorLedgerEntry.create({
    data: {
      vendorId,
      type: data.type,
      amount: data.amount,
      date: data.date,
      recordedById: data.recordedById,
      ...(data.description !== undefined ? { description: data.description } : {}),
    },
    include: ledgerEntryInclude,
  });
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
