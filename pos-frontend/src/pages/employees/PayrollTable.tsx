import { useState } from "react";
import { getApiErrorMessage } from "../../api/errors";
import type { PayrollRow } from "../../api/payroll";
import { useCurrentMonthPayroll, useUpsertPayroll } from "../../hooks/usePayroll";
import {
  Button,
  EmptyState,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../components/ui";

interface FormState {
  allowance: string;
  deduction: string;
  advanceTaken: string;
  paidAmount: string;
}

export function PayrollTable() {
  const { data: rows, isLoading, isError } = useCurrentMonthPayroll();
  const upsertMutation = useUpsertPayroll();

  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ allowance: "0", deduction: "0", advanceTaken: "0", paidAmount: "0" });

  function startEdit(row: PayrollRow) {
    setEditingEmployeeId(row.employeeId);
    setForm({
      allowance: row.allowance,
      deduction: row.deduction,
      advanceTaken: row.advanceTaken,
      paidAmount: row.paidAmount,
    });
  }

  async function handleSave(row: PayrollRow) {
    try {
      await upsertMutation.mutateAsync({
        employeeId: row.employeeId,
        month: row.month,
        year: row.year,
        allowance: Number(form.allowance),
        deduction: Number(form.deduction),
        advanceTaken: Number(form.advanceTaken),
        paidAmount: Number(form.paidAmount),
      });
      setEditingEmployeeId(null);
    } catch (error) {
      window.alert(getApiErrorMessage(error, "Failed to save payroll entry"));
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-heading text-section font-semibold text-ink">Payroll (current month)</h2>

      {isLoading && <p className="text-body text-ink-muted">Loading payroll…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load payroll.</p>}

      {rows && rows.length === 0 && (
        <EmptyState title="No payroll rows yet" description="Payroll rows appear once employees exist for this month." />
      )}

      {rows && rows.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Employee</TableHeaderCell>
              <TableHeaderCell>Base salary</TableHeaderCell>
              <TableHeaderCell>Allowance</TableHeaderCell>
              <TableHeaderCell>Deduction</TableHeaderCell>
              <TableHeaderCell>Advance taken</TableHeaderCell>
              <TableHeaderCell>Paid amount</TableHeaderCell>
              <TableHeaderCell>Remaining</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const isEditing = editingEmployeeId === row.employeeId;
              return (
                <TableRow key={row.employeeId}>
                  <TableCell className="font-medium text-ink">{row.employeeName}</TableCell>
                  <TableCell className="text-numeric">{Number(row.baseSalary).toFixed(2)}</TableCell>
                  {isEditing ? (
                    <>
                      <TableCell className="w-28">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={form.allowance}
                          onChange={(event) => setForm((prev) => ({ ...prev, allowance: event.target.value }))}
                        />
                      </TableCell>
                      <TableCell className="w-28">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={form.deduction}
                          onChange={(event) => setForm((prev) => ({ ...prev, deduction: event.target.value }))}
                        />
                      </TableCell>
                      <TableCell className="w-28">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={form.advanceTaken}
                          onChange={(event) => setForm((prev) => ({ ...prev, advanceTaken: event.target.value }))}
                        />
                      </TableCell>
                      <TableCell className="w-28">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={form.paidAmount}
                          onChange={(event) => setForm((prev) => ({ ...prev, paidAmount: event.target.value }))}
                        />
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="text-numeric">{Number(row.allowance).toFixed(2)}</TableCell>
                      <TableCell className="text-numeric">{Number(row.deduction).toFixed(2)}</TableCell>
                      <TableCell className="text-numeric">{Number(row.advanceTaken).toFixed(2)}</TableCell>
                      <TableCell className="text-numeric">{Number(row.paidAmount).toFixed(2)}</TableCell>
                    </>
                  )}
                  <TableCell className="text-numeric">{Number(row.remainingAmount).toFixed(2)}</TableCell>
                  <TableCell>
                    {isEditing ? (
                      <div className="flex gap-2">
                        <Button variant="primary" onClick={() => handleSave(row)} disabled={upsertMutation.isPending}>
                          {upsertMutation.isPending ? "Saving…" : "Save"}
                        </Button>
                        <Button variant="secondary" onClick={() => setEditingEmployeeId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button variant="secondary" onClick={() => startEdit(row)}>
                        Edit
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
