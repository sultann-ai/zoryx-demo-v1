import { AttendanceGrid } from "./employees/AttendanceGrid";
import { EmployeeList } from "./employees/EmployeeList";
import { PayrollTable } from "./employees/PayrollTable";
import { PageHeader } from "../components/ui";

export function EmployeesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Employees" />
      <EmployeeList />
      <AttendanceGrid />
      <PayrollTable />
    </div>
  );
}
