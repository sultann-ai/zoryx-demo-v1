import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { getApiErrorMessage } from "../../api/errors";
import type { Testimonial } from "../../api/onlineStore";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FormActions,
  Input,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Textarea,
} from "../../components/ui";
import { cn } from "../../components/ui/cn";
import { ListRowActions } from "../../components/onlineStore/ListRowActions";
import { OnlineStoreHeader } from "../../components/onlineStore/OnlineStoreHeader";
import {
  useCreateTestimonial,
  useDeleteTestimonial,
  useReorderTestimonials,
  useTestimonials,
  useUpdateTestimonial,
} from "../../hooks/useOnlineStore";
import { moveRow } from "../../lib/reorder";
import { scrollFormIntoView } from "../../lib/scrollFormIntoView";

const MAX_SHOWN = 12;

interface FormState {
  name: string;
  area: string;
  text: string;
  textUr: string;
  rating: number | null;
}

const EMPTY_FORM: FormState = { name: "", area: "", text: "", textUr: "", rating: null };

const blankToNull = (value: string) => (value.trim().length === 0 ? null : value.trim());

function stars(rating: number | null): string {
  return rating === null ? "—" : `${"★".repeat(rating)}${"☆".repeat(5 - rating)}`;
}

export function TestimonialsPage() {
  const { data: testimonials, isLoading, isError } = useTestimonials();
  const createMutation = useCreateTestimonial();
  const updateMutation = useUpdateTestimonial();
  const deleteMutation = useDeleteTestimonial();
  const reorderMutation = useReorderTestimonials();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Testimonial | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const shownCount = (testimonials ?? []).filter((testimonial) => testimonial.isActive).length;

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function startEdit(testimonial: Testimonial) {
    setEditingId(testimonial.id);
    setForm({
      name: testimonial.name,
      area: testimonial.area ?? "",
      text: testimonial.text,
      textUr: testimonial.textUr ?? "",
      rating: testimonial.rating,
    });
    setFormError(null);
    scrollFormIntoView(formCardRef.current);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const input = {
      name: form.name.trim(),
      text: form.text.trim(),
      area: blankToNull(form.area),
      textUr: blankToNull(form.textUr),
      rating: form.rating,
    };
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, input });
      } else {
        await createMutation.mutateAsync({ ...input, sortOrder: testimonials?.length ?? 0 });
      }
      startCreate();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Could not save the review."));
    }
  }

  async function handleToggle(testimonial: Testimonial) {
    setListError(null);
    try {
      await updateMutation.mutateAsync({ id: testimonial.id, input: { isActive: !testimonial.isActive } });
    } catch (error) {
      setListError(getApiErrorMessage(error, "Could not change this review."));
    }
  }

  async function handleMove(testimonial: Testimonial, direction: "up" | "down") {
    setListError(null);
    try {
      await reorderMutation.mutateAsync(moveRow(testimonials ?? [], testimonial.id, direction));
    } catch (error) {
      setListError(getApiErrorMessage(error, "Could not change the order."));
    }
  }

  async function handleDelete() {
    if (!toDelete) {
      return;
    }
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(toDelete.id);
      if (editingId === toDelete.id) {
        startCreate();
      }
      setToDelete(null);
    } catch (error) {
      setDeleteError(getApiErrorMessage(error, "Could not delete this review."));
    }
  }

  const busy = updateMutation.isPending || reorderMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      <OnlineStoreHeader title="Testimonials" description={`What customers say about you. ${shownCount} of ${MAX_SHOWN} shown.`} />

      <div role="note" className="max-w-2xl rounded-card border border-status-warning bg-status-warning-bg px-4 py-3 text-body font-medium text-status-warning-text">
        Only real reviews, with permission.
      </div>

      <Card ref={formCardRef} title={editingId ? "Edit review" : "Add review"} className="max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-meta font-medium text-ink-muted">Customer name</span>
              <Input value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} required maxLength={80} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-meta font-medium text-ink-muted">Area (optional)</span>
              <Input value={form.area} onChange={(event) => setForm((previous) => ({ ...previous, area: event.target.value }))} maxLength={80} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-meta font-medium text-ink-muted">Review (English)</span>
            <Textarea value={form.text} onChange={(event) => setForm((previous) => ({ ...previous, text: event.target.value }))} required maxLength={600} rows={3} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-meta font-medium text-ink-muted">Review (Urdu, optional)</span>
            <Textarea dir="rtl" lang="ur" value={form.textUr} onChange={(event) => setForm((previous) => ({ ...previous, textUr: event.target.value }))} maxLength={600} rows={3} />
          </label>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-meta font-medium text-ink-muted">Stars (optional)</legend>
            <div role="group" aria-label="Stars" className="flex flex-wrap gap-2">
              {[null, 1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value ?? "none"}
                  type="button"
                  aria-pressed={form.rating === value}
                  onClick={() => setForm((previous) => ({ ...previous, rating: value }))}
                  className={cn(
                    "inline-flex h-11 min-w-11 items-center justify-center rounded-card border px-4 text-body font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised",
                    form.rating === value ? "border-accent bg-accent text-white" : "border-border bg-surface-raised text-ink-muted hover:bg-surface",
                  )}
                >
                  {value ?? "None"}
                </button>
              ))}
            </div>
          </fieldset>
          {formError && (
            <p role="alert" className="text-body text-status-danger-text">
              {formError}
            </p>
          )}
          <FormActions>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? "Saving…" : editingId ? "Save changes" : "Add review"}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={startCreate}>
                Cancel
              </Button>
            )}
          </FormActions>
        </form>
      </Card>

      {isLoading && <p className="text-body text-ink-muted">Loading reviews…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load the reviews.</p>}
      {listError && (
        <p role="alert" className="text-body text-status-danger-text">
          {listError}
        </p>
      )}

      {testimonials && testimonials.length === 0 && <EmptyState title="No reviews yet" description="Add a review a customer has given you, with their permission." />}

      {testimonials && testimonials.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Customer</TableHeaderCell>
              <TableHeaderCell>Review</TableHeaderCell>
              <TableHeaderCell>Stars</TableHeaderCell>
              <TableHeaderCell>On the website</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {testimonials.map((testimonial, index) => (
              <TableRow key={testimonial.id}>
                <TableCell className="font-medium text-ink">
                  <div className="flex flex-col max-md:items-end">
                    <span>{testimonial.name}</span>
                    {testimonial.area && <span className="text-meta text-ink-muted">{testimonial.area}</span>}
                  </div>
                </TableCell>
                <TableCell>
                  <p className="max-w-md">{testimonial.text}</p>
                </TableCell>
                <TableCell>
                  <span aria-label={testimonial.rating === null ? "No rating" : `${testimonial.rating} out of 5`}>{stars(testimonial.rating)}</span>
                </TableCell>
                <TableCell>
                  <StatusBadge status={testimonial.isActive ? "ACTIVE" : "INACTIVE"} label={testimonial.isActive ? "Shown" : "Hidden"} />
                </TableCell>
                <TableCell>
                  <ListRowActions
                    isFirst={index === 0}
                    isLast={index === testimonials.length - 1}
                    onMoveUp={() => void handleMove(testimonial, "up")}
                    onMoveDown={() => void handleMove(testimonial, "down")}
                    isActive={testimonial.isActive}
                    onToggleActive={() => void handleToggle(testimonial)}
                    onEdit={() => startEdit(testimonial)}
                    onDelete={() => {
                      setDeleteError(null);
                      setToDelete(testimonial);
                    }}
                    disabled={busy}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => void handleDelete()}
        title="Delete this review?"
        message={
          <>
            Delete the review from <strong>{toDelete?.name}</strong>? Use Hide instead if you may want it back.
          </>
        }
        isConfirming={deleteMutation.isPending}
        error={deleteError}
      />
    </div>
  );
}
