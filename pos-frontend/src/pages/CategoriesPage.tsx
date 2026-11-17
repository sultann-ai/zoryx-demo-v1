import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { getApiErrorMessage } from "../api/errors";
import type { Category } from "../api/categories";
import { useAuth } from "../context/AuthContext";
import { useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory } from "../hooks/useCategories";
import { scrollFormIntoView } from "../lib/scrollFormIntoView";
import {
  Button,
  Card,
  EmptyState,
  FormActions,
  Input,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../components/ui";

interface FormState {
  name: string;
}

const EMPTY_FORM: FormState = { name: "" };

export function CategoriesPage() {
  const { staff } = useAuth();
  const canWrite = staff?.role === "SUPER_ADMIN" || staff?.role === "POS_ADMIN";

  const { data: categories, isLoading, isError } = useCategories();
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

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

  function startEdit(category: Category) {
    setEditingId(category.id);
    setForm({ name: category.name });
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
      setFormError(getApiErrorMessage(error, "Failed to save category"));
    }
  }

  async function handleDelete(category: Category) {
    if (!window.confirm(`Delete category "${category.name}"?`)) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(category.id);
      if (editingId === category.id) {
        startCreate();
      }
    } catch (error) {
      window.alert(getApiErrorMessage(error, "Failed to delete category"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Categories" />

      {canWrite && (
        <Card ref={formCardRef} title={editingId ? "Edit category" : "Add category"} className="max-w-lg">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="category-name" className="text-meta font-medium text-ink-muted">
                Name
              </label>
              <Input
                id="category-name"
                type="text"
                value={form.name}
                onChange={(event) => setForm({ name: event.target.value })}
                required
              />
            </div>
            {formError && (
              <p role="alert" className="text-body text-status-danger-text">
                {formError}
              </p>
            )}
            <FormActions>
              <Button type="submit" variant="primary" disabled={isSaving}>
                {isSaving ? "Saving…" : editingId ? "Save changes" : "Add category"}
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

      {isLoading && <p className="text-body text-ink-muted">Loading categories…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load categories.</p>}

      {categories && categories.length === 0 && (
        <EmptyState title="No categories yet" description="Add a category to start grouping menu items." />
      )}

      {categories && categories.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              {canWrite && <TableHeaderCell />}
            </TableRow>
          </TableHead>
          <TableBody>
            {categories.map((category) => (
              <TableRow key={category.id}>
                <TableCell className="font-medium text-ink">{category.name}</TableCell>
                {canWrite && (
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => startEdit(category)}>
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => handleDelete(category)}
                        disabled={deleteMutation.isPending}
                      >
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
