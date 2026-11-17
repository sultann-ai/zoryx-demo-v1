import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { getApiErrorMessage } from "../../api/errors";
import type { DeliveryArea } from "../../api/onlineStore";
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
} from "../../components/ui";
import { ListRowActions } from "../../components/onlineStore/ListRowActions";
import { OnlineStoreHeader } from "../../components/onlineStore/OnlineStoreHeader";
import {
  useCreateDeliveryArea,
  useDeleteDeliveryArea,
  useDeliveryAreas,
  useReorderDeliveryAreas,
  useUpdateDeliveryArea,
} from "../../hooks/useOnlineStore";
import { formatMoney } from "../../lib/format";
import { moveRow } from "../../lib/reorder";
import { scrollFormIntoView } from "../../lib/scrollFormIntoView";

const MAX_SHOWN = 30;

interface FormState {
  nameEn: string;
  nameUr: string;
  deliveryFee: string;
  minOrderAmount: string;
}

const EMPTY_FORM: FormState = { nameEn: "", nameUr: "", deliveryFee: "", minOrderAmount: "" };

export function DeliveryAreasPage() {
  const { data: areas, isLoading, isError } = useDeliveryAreas();
  const createMutation = useCreateDeliveryArea();
  const updateMutation = useUpdateDeliveryArea();
  const deleteMutation = useDeleteDeliveryArea();
  const reorderMutation = useReorderDeliveryAreas();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<DeliveryArea | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const shownCount = (areas ?? []).filter((area) => area.isActive).length;

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function startEdit(area: DeliveryArea) {
    setEditingId(area.id);
    setForm({ nameEn: area.nameEn, nameUr: area.nameUr, deliveryFee: area.deliveryFee, minOrderAmount: area.minOrderAmount });
    setFormError(null);
    scrollFormIntoView(formCardRef.current);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const fee = form.deliveryFee.trim() === "" ? 0 : Number(form.deliveryFee);
    const minimum = form.minOrderAmount.trim() === "" ? 0 : Number(form.minOrderAmount);
    if (Number.isNaN(fee) || fee < 0 || Number.isNaN(minimum) || minimum < 0) {
      setFormError("The fee and the minimum order must be numbers, 0 or more.");
      return;
    }
    const input = { nameEn: form.nameEn.trim(), nameUr: form.nameUr.trim(), deliveryFee: fee, minOrderAmount: minimum };
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, input });
      } else {
        await createMutation.mutateAsync({ ...input, sortOrder: areas?.length ?? 0 });
      }
      startCreate();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Could not save the area."));
    }
  }

  async function handleToggle(area: DeliveryArea) {
    setListError(null);
    try {
      await updateMutation.mutateAsync({ id: area.id, input: { isActive: !area.isActive } });
    } catch (error) {
      setListError(getApiErrorMessage(error, "Could not change this area."));
    }
  }

  async function handleMove(area: DeliveryArea, direction: "up" | "down") {
    setListError(null);
    try {
      await reorderMutation.mutateAsync(moveRow(areas ?? [], area.id, direction));
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
      // e.g. "still in use — hide it instead": the server's own words.
      setDeleteError(getApiErrorMessage(error, "Could not delete this area."));
    }
  }

  const busy = updateMutation.isPending || reorderMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      <OnlineStoreHeader
        title="Delivery areas"
        description={`Where you deliver, with the delivery fee and the smallest order for each. ${shownCount} of ${MAX_SHOWN} shown.`}
      />

      <Card ref={formCardRef} title={editingId ? "Edit area" : "Add area"} className="max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-meta font-medium text-ink-muted">Name (English)</span>
              <Input value={form.nameEn} onChange={(event) => setForm((previous) => ({ ...previous, nameEn: event.target.value }))} required maxLength={80} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-meta font-medium text-ink-muted">Name (Urdu)</span>
              <Input dir="rtl" lang="ur" value={form.nameUr} onChange={(event) => setForm((previous) => ({ ...previous, nameUr: event.target.value }))} required maxLength={80} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-meta font-medium text-ink-muted">Delivery fee</span>
              <Input type="number" inputMode="decimal" min={0} step="0.01" placeholder="0" value={form.deliveryFee} onChange={(event) => setForm((previous) => ({ ...previous, deliveryFee: event.target.value }))} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-meta font-medium text-ink-muted">Minimum order</span>
              <Input type="number" inputMode="decimal" min={0} step="0.01" placeholder="0" value={form.minOrderAmount} onChange={(event) => setForm((previous) => ({ ...previous, minOrderAmount: event.target.value }))} />
            </label>
          </div>
          {formError && (
            <p role="alert" className="text-body text-status-danger-text">
              {formError}
            </p>
          )}
          <FormActions>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? "Saving…" : editingId ? "Save changes" : "Add area"}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={startCreate}>
                Cancel
              </Button>
            )}
          </FormActions>
        </form>
      </Card>

      {isLoading && <p className="text-body text-ink-muted">Loading areas…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load the delivery areas.</p>}
      {listError && (
        <p role="alert" className="text-body text-status-danger-text">
          {listError}
        </p>
      )}

      {areas && areas.length === 0 && <EmptyState title="No delivery areas yet" description="Add the areas you deliver to. Customers pick one when they order." />}

      {areas && areas.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Area</TableHeaderCell>
              <TableHeaderCell>Delivery fee</TableHeaderCell>
              <TableHeaderCell>Minimum order</TableHeaderCell>
              <TableHeaderCell>On the website</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {areas.map((area, index) => (
              <TableRow key={area.id}>
                <TableCell className="font-medium text-ink">
                  <div className="flex flex-col max-md:items-end">
                    <span>{area.nameEn}</span>
                    <span dir="rtl" lang="ur" className="text-meta text-ink-muted">
                      {area.nameUr}
                    </span>
                  </div>
                </TableCell>
                <TableCell>{formatMoney(area.deliveryFee)}</TableCell>
                <TableCell>{Number(area.minOrderAmount) > 0 ? formatMoney(area.minOrderAmount) : "None"}</TableCell>
                <TableCell>
                  <StatusBadge status={area.isActive ? "ACTIVE" : "INACTIVE"} label={area.isActive ? "Shown" : "Hidden"} />
                </TableCell>
                <TableCell>
                  <ListRowActions
                    isFirst={index === 0}
                    isLast={index === areas.length - 1}
                    onMoveUp={() => void handleMove(area, "up")}
                    onMoveDown={() => void handleMove(area, "down")}
                    isActive={area.isActive}
                    onToggleActive={() => void handleToggle(area)}
                    onEdit={() => startEdit(area)}
                    onDelete={() => {
                      setDeleteError(null);
                      setToDelete(area);
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
        title="Delete this area?"
        message={
          <>
            Delete <strong>{toDelete?.nameEn}</strong>? Customers will no longer be able to choose it. If it has been used on an order, hide it instead.
          </>
        }
        isConfirming={deleteMutation.isPending}
        error={deleteError}
      />
    </div>
  );
}
