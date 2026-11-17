import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { getApiErrorMessage } from "../../api/errors";
import type { Employee } from "../../api/employees";
import { useCreateEmployee, useEmployees, useUpdateEmployee } from "../../hooks/useEmployees";
import { scrollFormIntoView } from "../../lib/scrollFormIntoView";
import {
  Button,
  Card,
  EmptyState,
  FormActions,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../components/ui";

interface FormState {
  name: string;
  designation: string;
  baseSalary: string;
  joiningDate: string;
  phone: string;
}

const EMPTY_FORM: FormState = { name: "", designation: "", baseSalary: "", joiningDate: "", phone: "" };

export function EmployeeList() {
  const { data: employees, isLoading, isError } = useEmployees();
  const createMutation = useCreateEmployee();
  const updateMutation = useUpdateEmployee();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function startEdit(employee: Employee) {
    setEditingId(employee.id);
    setForm({
      name: employee.name,
      designation: employee.designation,
      baseSalary: employee.baseSalary,
      joiningDate: employee.joiningDate.slice(0, 10),
      phone: employee.phone ?? "",
    });
    setFormError(null);
    scrollFormIntoView(formCardRef.current);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const baseSalary = Number(form.baseSalary);
    const phone = form.phone.trim();

    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          input: {
            name: form.name,
            designation: form.designation,
            baseSalary,
            joiningDate: form.joiningDate,
            phone: phone === "" ? null : phone,
          },
        });
      } else {
        await createMutation.mutateAsync({
          name: form.name,
          designation: form.designation,
          baseSalary,
          joiningDate: form.joiningDate,
          ...(phone !== "" ? { phone } : {}),
        });
      }
      startCreate();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Failed to save employee"));
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-heading text-section font-semibold text-ink">Employees</h2>

      <Card ref={formCardRef} title={editingId ? "Edit employee" : "Add employee"} className="max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="employee-name" className="text-meta font-medium text-ink-muted">
                Name
              </label>
              <Input
                id="employee-name"
                type="text"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="employee-designation" className="text-meta font-medium text-ink-muted">
                Designation
              </label>
              <Input
                id="employee-designation"
                type="text"
                value={form.designation}
                onChange={(event) => setForm((prev) => ({ ...prev, designation: event.target.value }))}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="employee-base-salary" className="text-meta font-medium text-ink-muted">
                Base salary
              </label>
              <Input
                id="employee-base-salary"
                type="number"
                min={0}
                step={0.01}
                value={form.baseSalary}
                onChange={(event) => setForm((prev) => ({ ...prev, baseSalary: event.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="employee-joining-date" className="text-meta font-medium text-ink-muted">
                Joining date
              </label>
              <Input
                id="employee-joining-date"
                type="date"
                value={form.joiningDate}
                onChange={(event) => setForm((prev) => ({ ...prev, joiningDate: event.target.value }))}
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="employee-phone" className="text-meta font-medium text-ink-muted">
              Phone
            </label>
            <Input
              id="employee-phone"
              type="text"
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
          </div>
          {formError && (
            <p role="alert" className="text-body text-status-danger-text">
              {formError}
            </p>
          )}
          <FormActions>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? "Saving…" : editingId ? "Save changes" : "Add employee"}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={startCreate}>
                Cancel
              </Button>
            )}
          </FormActions>
        </form>
      </Card>

      {isLoading && <p className="text-body text-ink-muted">Loading employees…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load employees.</p>}

      {employees && employees.length === 0 && (
        <EmptyState title="No employees yet" description="Add an employee to start tracking attendance and payroll." />
      )}

      {employees && employees.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Designation</TableHeaderCell>
              <TableHeaderCell>Base salary</TableHeaderCell>
              <TableHeaderCell>Joining date</TableHeaderCell>
              <TableHeaderCell>Phone</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {employees.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell className="font-medium text-ink">{employee.name}</TableCell>
                <TableCell>{employee.designation}</TableCell>
                <TableCell className="text-numeric">{Number(employee.baseSalary).toFixed(2)}</TableCell>
                <TableCell>{employee.joiningDate.slice(0, 10)}</TableCell>
                <TableCell>{employee.phone ?? "—"}</TableCell>
                <TableCell>
                  <Button variant="secondary" onClick={() => startEdit(employee)}>
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
