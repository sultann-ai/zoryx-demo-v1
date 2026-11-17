import { describe, expect, it } from "vitest";
import { StaffRole } from "../../../generated/prisma/client";
import { revokeReason } from "./staff.controller";

const kitchenStaff = { role: StaffRole.KITCHEN, kitchenId: "k1", isActive: true };

describe("revokeReason (which staff changes end live sessions)", () => {
  it("ends them on deactivation, role change, kitchen change and password reset", () => {
    expect(revokeReason(kitchenStaff, { ...kitchenStaff, isActive: false }, false)).toBe("Account deactivated");
    expect(revokeReason(kitchenStaff, { ...kitchenStaff, role: StaffRole.POS_ADMIN, kitchenId: null }, false)).toBe("Role changed");
    expect(revokeReason(kitchenStaff, { ...kitchenStaff, kitchenId: "k2" }, false)).toBe("Kitchen changed");
    expect(revokeReason(kitchenStaff, kitchenStaff, true)).toBe("Password reset");
  });

  it("leaves them alone for anything else (a name change, a reactivation)", () => {
    expect(revokeReason(kitchenStaff, kitchenStaff, false)).toBeNull();
    expect(revokeReason({ ...kitchenStaff, isActive: false }, kitchenStaff, false)).toBeNull();
  });
});
