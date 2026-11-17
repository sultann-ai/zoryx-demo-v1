import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useParams } from "react-router-dom";
import { getApiErrorMessage } from "../api/errors";
import type { VendorLedgerEntry, VendorLedgerEntryType } from "../api/vendors";
import { useAddLedgerEntry, useVendor, useVendorLedger } from "../hooks/useVendors";
import {
  Button,
  Card,
  EmptyState,
  FormActions,
  Input,
  PageHeader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../components/ui";
import { VENDOR_LEDGER_ENTRY_TYPE_LABEL } from "../lib/enumLabels";

const LEDGER_ENTRY_TYPES: VendorLedgerEntryType[] = ["PURCHASE", "PAYMENT"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-meta font-medium text-ink-muted">{label}</span>
      <span className="break-words text-body text-ink">{value}</span>
    </div>
  );
}

interface EntryFormState {
  type: VendorLedgerEntryType;
  amount: string;
  description: string;
  date: string;
}

function emptyEntryForm(): EntryFormState {
  return { type: "PURCHASE", amount: "", description: "", date: today() };
}

export function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const vendorId = id ?? "";

  const { data: vendor, isLoading: isVendorLoading, isError: isVendorError } = useVendor(vendorId);
  const { data: ledger, isLoading: isLedgerLoading, isError: isLedgerError } = useVendorLedger(vendorId);
  const addEntryMutation = useAddLedgerEntry();

  const [form, setForm] = useState<EntryFormState>(emptyEntryForm);
  const [formError, setFormError] = useState<string | null>(null);

  if (isVendorLoading) {
    return <p className="text-body text-ink-muted">Loading vendor…</p>;
  }
  if (isVendorError || !vendor) {
    return <p className="text-body text-status-danger-text">Vendor not found.</p>;
  }

  // The ledger comes back newest-first; re-sort oldest-first so the running
  // balance accumulates top-to-bottom like a statement, ending at the vendor's
  // current balance on the last row.
  const chronological = [...(ledger?.entries ?? [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.createdAt.localeCompare(b.createdAt),
  );
  let runningTotal = 0;
  const withRunningBalance: { entry: VendorLedgerEntry; runningBalance: number }[] = chronological.map((entry) => {
    runningTotal += entry.type === "PURCHASE" ? Number(entry.amount) : -Number(entry.amount);
    return { entry, runningBalance: runningTotal };
  });

  async function handleAddEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const amount = Number(form.amount);

    try {
      await addEntryMutation.mutateAsync({
        vendorId,
        input: {
          type: form.type,
          amount,
          date: form.date,
          ...(form.description.trim() !== "" ? { description: form.description.trim() } : {}),
        },
      });
      setForm(emptyEntryForm());
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Failed to add ledger entry"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={vendor.name} />

      <Card>
        <div className="grid grid-cols-1 gap-y-4 sm:grid-cols-2 sm:gap-x-8 md:grid-cols-3">
          <DetailField label="Contact person" value={vendor.contactPerson ?? "—"} />
          <DetailField label="Phone" value={vendor.phone ?? "—"} />
          <DetailField label="Address" value={vendor.address ?? "—"} />
          <DetailField label="Status" value={vendor.isActive ? "Active" : "Inactive"} />
          <DetailField
            label="Current balance owed"
            value={
              <span className="text-numeric text-title font-semibold text-ink">
                {ledger ? Number(ledger.balance).toFixed(2) : "—"}
              </span>
            }
          />
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-section font-semibold text-ink">Ledger history</h2>

        {isLedgerLoading && <p className="text-body text-ink-muted">Loading ledger…</p>}
        {isLedgerError && <p className="text-body text-status-danger-text">Could not load ledger.</p>}

        {withRunningBalance.length === 0 && ledger && (
          <EmptyState title="No entries yet" description="Add a purchase or payment below to start this vendor's ledger." />
        )}

        {withRunningBalance.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>Amount</TableHeaderCell>
                <TableHeaderCell>Description</TableHeaderCell>
                <TableHeaderCell>Balance</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {withRunningBalance.map(({ entry, runningBalance }) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.date.slice(0, 10)}</TableCell>
                  <TableCell>{VENDOR_LEDGER_ENTRY_TYPE_LABEL[entry.type]}</TableCell>
                  <TableCell className="text-numeric">{Number(entry.amount).toFixed(2)}</TableCell>
                  <TableCell>{entry.description ?? "—"}</TableCell>
                  <TableCell className="text-numeric">{runningBalance.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Card title="Add ledger entry" className="max-w-2xl">
        <form onSubmit={handleAddEntry} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ledger-entry-type" className="text-meta font-medium text-ink-muted">
                Type
              </label>
              <Select
                id="ledger-entry-type"
                value={form.type}
                onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as VendorLedgerEntryType }))}
              >
                {LEDGER_ENTRY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {VENDOR_LEDGER_ENTRY_TYPE_LABEL[type]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ledger-entry-amount" className="text-meta font-medium text-ink-muted">
                Amount
              </label>
              <Input
                id="ledger-entry-amount"
                type="number"
                min={0.01}
                step={0.01}
                value={form.amount}
                onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ledger-entry-date" className="text-meta font-medium text-ink-muted">
                Date
              </label>
              <Input
                id="ledger-entry-date"
                type="date"
                value={form.date}
                onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ledger-entry-description" className="text-meta font-medium text-ink-muted">
              Description
            </label>
            <Input
              id="ledger-entry-description"
              type="text"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </div>
          {formError && <p role="alert" className="text-body text-status-danger-text">{formError}</p>}
          <FormActions>
            <Button type="submit" variant="primary" disabled={addEntryMutation.isPending}>
              {addEntryMutation.isPending ? "Saving…" : "Add entry"}
            </Button>
          </FormActions>
        </form>
      </Card>
    </div>
  );
}
