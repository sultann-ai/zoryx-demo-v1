import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { getApiErrorMessage } from "../api/errors";
import type { VendorSummary } from "../api/vendors";
import { useCreateVendor, useUpdateVendor, useVendors } from "../hooks/useVendors";
import { scrollFormIntoView } from "../lib/scrollFormIntoView";
import {
  Button,
  Card,
  EmptyState,
  FormActions,
  Input,
  PageHeader,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  buttonClassName,
} from "../components/ui";

interface FormState {
  name: string;
  contactPerson: string;
  phone: string;
  address: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = { name: "", contactPerson: "", phone: "", address: "", isActive: true };

export function VendorsPage() {
  const { data: vendors, isLoading, isError } = useVendors();
  const createMutation = useCreateVendor();
  const updateMutation = useUpdateVendor();

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

  function startEdit(vendor: VendorSummary) {
    setEditingId(vendor.id);
    setForm({
      name: vendor.name,
      contactPerson: vendor.contactPerson ?? "",
      phone: vendor.phone ?? "",
      address: vendor.address ?? "",
      isActive: vendor.isActive,
    });
    setFormError(null);
    scrollFormIntoView(formCardRef.current);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const contactPerson = form.contactPerson.trim();
    const phone = form.phone.trim();
    const address = form.address.trim();

    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          input: {
            name: form.name,
            contactPerson: contactPerson === "" ? null : contactPerson,
            phone: phone === "" ? null : phone,
            address: address === "" ? null : address,
            isActive: form.isActive,
          },
        });
      } else {
        await createMutation.mutateAsync({
          name: form.name,
          ...(contactPerson !== "" ? { contactPerson } : {}),
          ...(phone !== "" ? { phone } : {}),
          ...(address !== "" ? { address } : {}),
          isActive: form.isActive,
        });
      }
      startCreate();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Failed to save vendor"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Vendor Ledger" />

      <Card ref={formCardRef} title={editingId ? "Edit vendor" : "Add vendor"} className="max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="vendor-name" className="text-meta font-medium text-ink-muted">
                Name
              </label>
              <Input
                id="vendor-name"
                type="text"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="vendor-contact-person" className="text-meta font-medium text-ink-muted">
                Contact person
              </label>
              <Input
                id="vendor-contact-person"
                type="text"
                value={form.contactPerson}
                onChange={(event) => setForm((prev) => ({ ...prev, contactPerson: event.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="vendor-phone" className="text-meta font-medium text-ink-muted">
                Phone
              </label>
              <Input
                id="vendor-phone"
                type="text"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="vendor-address" className="text-meta font-medium text-ink-muted">
                Address
              </label>
              <Input
                id="vendor-address"
                type="text"
                value={form.address}
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-body text-ink max-md:min-h-11">
            <input
              type="checkbox"
              className="h-4 w-4 rounded-sm border-border accent-accent"
              checked={form.isActive}
              onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
            />
            Active
          </label>
          {formError && <p role="alert" className="text-body text-status-danger-text">{formError}</p>}
          <FormActions>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? "Saving…" : editingId ? "Save changes" : "Add vendor"}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={startCreate}>
                Cancel
              </Button>
            )}
          </FormActions>
        </form>
      </Card>

      {isLoading && <p className="text-body text-ink-muted">Loading vendors…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load vendors.</p>}
      {vendors && vendors.length === 0 && (
        <EmptyState title="No vendors yet" description="Add a vendor to start tracking purchases and payments." />
      )}
      {vendors && vendors.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Contact person</TableHeaderCell>
              <TableHeaderCell>Phone</TableHeaderCell>
              <TableHeaderCell>Balance owed</TableHeaderCell>
              <TableHeaderCell>Active</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {vendors.map((vendor) => (
              <TableRow key={vendor.id}>
                <TableCell className="font-medium text-ink">{vendor.name}</TableCell>
                <TableCell>{vendor.contactPerson ?? "—"}</TableCell>
                <TableCell>{vendor.phone ?? "—"}</TableCell>
                <TableCell className="text-numeric">{Number(vendor.balance).toFixed(2)}</TableCell>
                <TableCell>
                  <StatusBadge status={vendor.isActive ? "ACTIVE" : "INACTIVE"} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Link to={`/vendors/${vendor.id}`} className={buttonClassName("secondary")}>
                      View
                    </Link>
                    <Button variant="secondary" onClick={() => startEdit(vendor)}>
                      Edit
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
