import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import * as attendanceController from "./attendance.controller";
import * as employeeController from "./employee.controller";
import * as payrollController from "./payroll.controller";

export const employeeRouter = Router();

employeeRouter.use(requireAuth, requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN));

// Static sub-resource paths registered before "/:id" so they aren't swallowed by it.
employeeRouter.get("/attendance", attendanceController.getAttendanceRange);
employeeRouter.post("/attendance", attendanceController.markAttendance);

employeeRouter.get("/payroll/current-month", payrollController.getCurrentMonthPayroll);
employeeRouter.post("/payroll", payrollController.upsertPayrollEntry);

employeeRouter.get("/", employeeController.listEmployees);
employeeRouter.post("/", employeeController.createEmployee);
employeeRouter.get("/:id", employeeController.getEmployee);
employeeRouter.put("/:id", employeeController.updateEmployee);
employeeRouter.delete("/:id", employeeController.deleteEmployee);
