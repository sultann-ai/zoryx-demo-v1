import { beforeEach, describe, expect, it, vi } from "vitest";

// updateSiteSettings with Prisma mocked: at least one way of ordering must stay switched on, judged on the
// settings AFTER the partial update is merged into what is stored.
const state = vi.hoisted(() => ({ row: { deliveryEnabled: true, pickupEnabled: true }, update: vi.fn() }));

vi.mock("../../config/prisma", () => ({
  prisma: {
    siteSettings: {
      upsert: async () => state.row,
      findUnique: async () => state.row,
      update: state.update,
    },
  },
}));

let service: typeof import("./siteContent.service");

beforeEach(async () => {
  process.env.DATABASE_URL ??= "postgresql://test";
  process.env.JWT_SECRET ??= "test-secret";
  process.env.PORT ??= "0";
  state.row = { deliveryEnabled: true, pickupEnabled: true };
  state.update.mockReset();
  state.update.mockImplementation(async ({ data }: { data: object }) => ({ ...state.row, ...data }));
  service = await import("./siteContent.service");
});

describe("updateSiteSettings: at least one order type stays on", () => {
  it("allows switching one off while the other is on", async () => {
    await expect(service.updateSiteSettings({ pickupEnabled: false })).resolves.toMatchObject({ pickupEnabled: false });
    expect(state.update).toHaveBeenCalledTimes(1);
  });

  it("refuses switching both off in one update", async () => {
    await expect(service.updateSiteSettings({ pickupEnabled: false, deliveryEnabled: false })).rejects.toBeInstanceOf(
      service.NoOrderTypeEnabledError,
    );
    expect(state.update).not.toHaveBeenCalled();
  });

  it("refuses switching off the last one that is still on (judged against what is stored)", async () => {
    state.row = { deliveryEnabled: false, pickupEnabled: true };
    await expect(service.updateSiteSettings({ pickupEnabled: false })).rejects.toBeInstanceOf(service.NoOrderTypeEnabledError);
    state.row = { deliveryEnabled: true, pickupEnabled: false };
    await expect(service.updateSiteSettings({ deliveryEnabled: false })).rejects.toBeInstanceOf(service.NoOrderTypeEnabledError);
  });

  it("allows turning one on and the other off together, and updates that do not touch the switches", async () => {
    state.row = { deliveryEnabled: false, pickupEnabled: true };
    await expect(service.updateSiteSettings({ deliveryEnabled: true, pickupEnabled: false })).resolves.toBeDefined();
    await expect(service.updateSiteSettings({ pickupNoteEn: "x" })).resolves.toBeDefined();
  });
});
