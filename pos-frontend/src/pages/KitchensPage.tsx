import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { getApiErrorMessage } from "../api/errors";
import type { Kitchen } from "../api/kitchens";
import { useAuth } from "../context/AuthContext";
import { useCreateKitchen, useDeleteKitchen, useKitchens, useUpdateKitchen } from "../hooks/useKitchens";
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
} from "../components/ui";

interface FormState {
  name: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = { name: "", isActive: true };

export function KitchensPage() {
  const { staff } = useAuth();
  const canWrite = staff?.role === "SUPER_ADMIN";

  const { data: kitchens, isLoading, isError } = useKitchens();
  const createMutation = useCreateKitchen();
  const updateMutation = useUpdateKitchen();
  const deleteMutation = useDeleteKitchen();

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

  function startEdit(kitchen: Kitchen) {
    setEditingId(kitchen.id);
    setForm({ name: kitchen.name, isActive: kitchen.isActive });
    setFormError(null);
    scrollFormIntoView(formCardRef.current);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, input: form });
      } else {
        await createMutation.mutateAsync(form);
      }
      startCreate();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Failed to save kitchen"));
    }
  }

  async function handleDelete(kitchen: Kitchen) {
    if (!window.confirm(`Delete kitchen "${kitchen.name}"?`)) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(kitchen.id);
      if (editingId === kitchen.id) {
        startCreate();
      }
    } catch (error) {
      window.alert(getApiErrorMessage(error, "Failed to delete kitchen"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Kitchens" />

      {canWrite && (
        <Card ref={formCardRef} title={editingId ? "Edit kitchen" : "Add kitchen"} className="max-w-lg">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="kitchen-name" className="text-meta font-medium text-ink-muted">
                Name
              </label>
              <Input
                id="kitchen-name"
                type="text"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
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
            {formError && (
              <p role="alert" className="text-body text-status-danger-text">
                {formError}
              </p>
            )}
            <FormActions>
              <Button type="submit" variant="primary" disabled={isSaving}>
                {isSaving ? "Saving…" : editingId ? "Save changes" : "Add kitchen"}
              </Button>
              {editingId && (
                <Button type="button" variant="secondary" onClick={startCreate}>
                  Cancel
                </Button>
              )}
            </FormActions>
          </form>
        </Card>
      )}

      {isLoading && <p className="text-body text-ink-muted">Loading kitchens…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load kitchens.</p>}

      {kitchens && kitchens.length === 0 && (
        <EmptyState title="No kitchens yet" description="Add a kitchen to start routing orders to it." />
      )}

      {kitchens && kitchens.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Active</TableHeaderCell>
              {canWrite && <TableHeaderCell />}
            </TableRow>
          </TableHead>
          <TableBody>
            {kitchens.map((kitchen) => (
              <TableRow key={kitchen.id}>
                <TableCell className="font-medium text-ink">{kitchen.name}</TableCell>
                <TableCell>
                  <StatusBadge status={kitchen.isActive ? "ACTIVE" : "INACTIVE"} />
                </TableCell>
                {canWrite && (
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => startEdit(kitchen)}>
                        Edit
                      </Button>
                      <Button variant="danger" onClick={() => handleDelete(kitchen)} disabled={deleteMutation.isPending}>
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
