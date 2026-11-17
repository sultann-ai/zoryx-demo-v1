import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { getApiErrorMessage } from "../../api/errors";
import type { PaymentAccount } from "../../api/onlineStore";
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
import { cn } from "../../components/ui/cn";
import { ImageThumb } from "../../components/onlineStore/ImageThumb";
import { ListRowActions } from "../../components/onlineStore/ListRowActions";
import { OnlineStoreHeader } from "../../components/onlineStore/OnlineStoreHeader";
import { PhotoUploadControl } from "../../components/onlineStore/PhotoUploadControl";
import {
  useCreatePaymentAccount,
  useDeletePaymentAccount,
  usePaymentAccounts,
  useReorderPaymentAccounts,
  useUpdatePaymentAccount,
} from "../../hooks/useOnlineStore";
import { moveRow } from "../../lib/reorder";
import { scrollFormIntoView } from "../../lib/scrollFormIntoView";

const MAX_SHOWN = 4;
const LABEL_SHORTCUTS = ["Easypaisa", "JazzCash", "Bank"];

interface FormState {
  label: string;
  accountTitle: string;
  accountNumber: string;
  qrMediaId: string | null;
}

const EMPTY_FORM: FormState = { label: "", accountTitle: "", accountNumber: "", qrMediaId: null };

export function PaymentAccountsPage() {
  const { data: accounts, isLoading, isError } = usePaymentAccounts();
  const createMutation = useCreatePaymentAccount();
  const updateMutation = useUpdatePaymentAccount();
  const deleteMutation = useDeletePaymentAccount();
  const reorderMutation = useReorderPaymentAccounts();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<PaymentAccount | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const shownCount = (accounts ?? []).filter((account) => account.isActive).length;

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function startEdit(account: PaymentAccount) {
    setEditingId(account.id);
    setForm({ label: account.label, accountTitle: account.accountTitle, accountNumber: account.accountNumber, qrMediaId: account.qrMediaId });
    setFormError(null);
    scrollFormIntoView(formCardRef.current);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const input = {
      label: form.label.trim(),
      accountTitle: form.accountTitle.trim(),
      accountNumber: form.accountNumber.trim(),
      qrMediaId: form.qrMediaId,
    };
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, input });
      } else {
        await createMutation.mutateAsync({ ...input, sortOrder: accounts?.length ?? 0 });
      }
      startCreate();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Could not save the account."));
    }
  }

  async function handleToggle(account: PaymentAccount) {
    setListError(null);
    try {
      await updateMutation.mutateAsync({ id: account.id, input: { isActive: !account.isActive } });
    } catch (error) {
      setListError(getApiErrorMessage(error, "Could not change this account."));
    }
  }

  async function handleMove(account: PaymentAccount, direction: "up" | "down") {
    setListError(null);
    try {
      await reorderMutation.mutateAsync(moveRow(accounts ?? [], account.id, direction));
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
      setDeleteError(getApiErrorMessage(error, "Could not delete this account."));
    }
  }

  const busy = updateMutation.isPending || reorderMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      <OnlineStoreHeader
        title="Payment accounts"
        description={`Where customers send their payment. ${shownCount} of ${MAX_SHOWN} shown.`}
      />

      <Card ref={formCardRef} title={editingId ? "Edit account" : "Add account"} className="max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="account-label" className="text-meta font-medium text-ink-muted">
              Name of the service
            </label>
            <Input id="account-label" value={form.label} onChange={(event) => setForm((previous) => ({ ...previous, label: event.target.value }))} placeholder="Easypaisa" required maxLength={60} />
            <div role="group" aria-label="Quick names" className="flex flex-wrap gap-2">
              {LABEL_SHORTCUTS.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setForm((previous) => ({ ...previous, label }))}
                  className={cn(
                    "inline-flex h-11 items-center rounded-card border px-4 text-body font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised",
                    form.label === label ? "border-accent bg-accent text-white" : "border-border bg-surface-raised text-ink-muted hover:bg-surface",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-meta font-medium text-ink-muted">Account title (name on the account)</span>
              <Input value={form.accountTitle} onChange={(event) => setForm((previous) => ({ ...previous, accountTitle: event.target.value }))} required maxLength={100} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-meta font-medium text-ink-muted">Account number</span>
              <Input value={form.accountNumber} onChange={(event) => setForm((previous) => ({ ...previous, accountNumber: event.target.value }))} required maxLength={60} />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-meta font-medium text-ink-muted">QR code (optional)</span>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="w-40 shrink-0">
                <ImageThumb mediaId={form.qrMediaId} alt="Payment QR code" shape="square" size="full" />
              </div>
              <div className="flex flex-col gap-2 sm:w-56">
                {/* A QR stays a lossless PNG so it still scans. Not saved to the account until "Save". */}
                <PhotoUploadControl
                  kind="PAYMENT_QR"
                  outputType="image/png"
                  hasPhoto={form.qrMediaId !== null}
                  onUploaded={(media) => setForm((previous) => ({ ...previous, qrMediaId: media.id }))}
                />
                {form.qrMediaId !== null && (
                  <Button variant="secondary" onClick={() => setForm((previous) => ({ ...previous, qrMediaId: null }))}>
                    Remove QR
                  </Button>
                )}
                <p className="text-meta text-ink-muted">Use a clear, flat screenshot of the QR from the app. It is never cropped.</p>
              </div>
            </div>
          </div>

          {formError && (
            <p role="alert" className="text-body text-status-danger-text">
              {formError}
            </p>
          )}
          <FormActions>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? "Saving…" : editingId ? "Save changes" : "Add account"}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={startCreate}>
                Cancel
              </Button>
            )}
          </FormActions>
        </form>
      </Card>

      {isLoading && <p className="text-body text-ink-muted">Loading accounts…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load the payment accounts.</p>}
      {listError && (
        <p role="alert" className="text-body text-status-danger-text">
          {listError}
        </p>
      )}

      {accounts && accounts.length === 0 && <EmptyState title="No payment accounts yet" description="Add an account so online customers know where to send their payment." />}

      {accounts && accounts.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Service</TableHeaderCell>
              <TableHeaderCell>Account</TableHeaderCell>
              <TableHeaderCell>QR</TableHeaderCell>
              <TableHeaderCell>On the website</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {accounts.map((account, index) => (
              <TableRow key={account.id}>
                <TableCell className="font-medium text-ink">{account.label}</TableCell>
                <TableCell>
                  <div className="flex flex-col max-md:items-end">
                    <span>{account.accountTitle}</span>
                    <span className="text-meta text-ink-muted">{account.accountNumber}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="w-16 max-md:ml-auto">
                    <ImageThumb mediaId={account.qrMediaId} alt={`${account.label} QR code`} shape="square" />
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={account.isActive ? "ACTIVE" : "INACTIVE"} label={account.isActive ? "Shown" : "Hidden"} />
                </TableCell>
                <TableCell>
                  <ListRowActions
                    isFirst={index === 0}
                    isLast={index === accounts.length - 1}
                    onMoveUp={() => void handleMove(account, "up")}
                    onMoveDown={() => void handleMove(account, "down")}
                    isActive={account.isActive}
                    onToggleActive={() => void handleToggle(account)}
                    onEdit={() => startEdit(account)}
                    onDelete={() => {
                      setDeleteError(null);
                      setToDelete(account);
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
        title="Delete this account?"
        message={
          <>
            Delete <strong>{toDelete?.label}</strong> ({toDelete?.accountNumber})? Customers will no longer see it. Its QR code is deleted too.
          </>
        }
        isConfirming={deleteMutation.isPending}
        error={deleteError}
      />
    </div>
  );
}
