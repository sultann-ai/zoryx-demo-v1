import { useState } from "react";
import type { AttendanceStatus } from "../../api/attendance";
import { getApiErrorMessage } from "../../api/errors";
import { useAttendanceRange, useMarkAttendance } from "../../hooks/useAttendance";
import { useEmployees } from "../../hooks/useEmployees";
import { Input, Select, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, tintBgClassForStatus } from "../../components/ui";
import { cn } from "../../components/ui/cn";
import { ATTENDANCE_STATUS_LABEL } from "../../lib/enumLabels";
import { addDays, shopToday } from "../../lib/shopTime";

const STATUS_OPTIONS: AttendanceStatus[] = ["PRESENT", "ABSENT", "LEAVE", "HALF_DAY"];

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function enumerateDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(formatDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

// The last 7 Pakistan dates, ending today.
function defaultStartDate(): string {
  return addDays(shopToday(), -6);
}

export function AttendanceGrid() {
  const { data: employees, isError: isEmployeesError } = useEmployees();
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(() => shopToday());
  const { data: records, isLoading, isError } = useAttendanceRange(startDate, endDate);
  const markMutation = useMarkAttendance();

  const dates = endDate >= startDate ? enumerateDates(startDate, endDate) : [];

  const statusByEmployeeAndDate = new Map<string, AttendanceStatus>();
  for (const record of records ?? []) {
    statusByEmployeeAndDate.set(`${record.employeeId}__${record.date.slice(0, 10)}`, record.status);
  }

  async function handleChange(employeeId: string, date: string, value: string) {
    if (value === "") {
      return;
    }
    try {
      await markMutation.mutateAsync({ employeeId, date, status: value as AttendanceStatus });
    } catch (error) {
      window.alert(getApiErrorMessage(error, "Failed to save attendance"));
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-heading text-section font-semibold text-ink">Attendance</h2>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="attendance-start-date" className="text-meta font-medium text-ink-muted">
            From
          </label>
          <Input
            id="attendance-start-date"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="attendance-end-date" className="text-meta font-medium text-ink-muted">
            To
          </label>
          <Input id="attendance-end-date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </div>
      </div>

      {endDate < startDate && (
        <p role="alert" className="text-body text-status-danger-text">
          "To" date must not be before "From" date.
        </p>
      )}
      {isLoading && <p className="text-body text-ink-muted">Loading attendance…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load attendance.</p>}
      {isEmployeesError && (
        <p role="alert" className="text-body text-status-danger-text">
          Could not load employees.
        </p>
      )}

      {dates.length > 0 && (
        // A real employee x date matrix, not name/value rows — kept as a
        // horizontally-scrolling table on a phone rather than stacked, or one
        // employee's row would become a wall of "date: status" pairs.
        <Table mobileLayout="scroll">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Employee</TableHeaderCell>
              {dates.map((date) => (
                <TableHeaderCell key={date}>{date}</TableHeaderCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {(employees ?? []).map((employee) => (
              <TableRow key={employee.id}>
                <TableCell className="font-medium text-ink">{employee.name}</TableCell>
                {dates.map((date) => {
                  const currentStatus = statusByEmployeeAndDate.get(`${employee.id}__${date}`) ?? "";
                  return (
                    <TableCell key={date} className={cn(currentStatus && tintBgClassForStatus(currentStatus))}>
                      <Select
                        aria-label={`${employee.name} — ${date}`}
                        className="min-w-28"
                        value={currentStatus}
                        disabled={markMutation.isPending}
                        onChange={(event) => handleChange(employee.id, date, event.target.value)}
                      >
                        <option value="">—</option>
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {ATTENDANCE_STATUS_LABEL[status]}
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
