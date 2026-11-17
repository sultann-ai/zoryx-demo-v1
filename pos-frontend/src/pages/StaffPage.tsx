import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { getApiErrorMessage } from "../api/errors";
import type { StaffUser } from "../api/staff";
import { STAFF_ROLES } from "../auth/session";
import type { StaffRole } from "../auth/session";
import { useKitchens } from "../hooks/useKitchens";
import { useCreateStaff, useDeactivateStaff, useStaffList, useUpdateStaff } from "../hooks/useStaff";
import { scrollFormIntoView } from "../lib/scrollFormIntoView";
import {
  Button,
  Card,
  EmptyState,
  FormActions,
  Input,
  PageHeader,
  Select,
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
  username: string;
  password: string;
  role: StaffRole;
  kitchenId: string;
  employeeId: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  username: "",
  password: "",
  role: "POS_ADMIN",
  kitchenId: "",
  employeeId: "",
};

const ROLE_LABEL: Record<StaffRole, string> = {
  SUPER_ADMIN: "Super admin",
  POS_ADMIN: "POS admin",
  ONLINE_ADMIN: "Online admin",
  KITCHEN: "Kitchen",
  // No screen in this app uses this role yet (it's built for a separate tablet/phone
  // client) — SUPER_ADMIN can still create the account from here ahead of that.
  ORDER_TAKER: "Order taker",
};

export function StaffPage() {
  const { data: staffList, isLoading, isError } = useStaffList();
  const { data: kitchens, isError: isKitchensError } = useKitchens();
  const createMutation = useCreateStaff();
  const updateMutation = useUpdateStaff();
  const deactivateMutation = useDeactivateStaff();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const kitchenNameById = new Map((kitchens ?? []).map((kitchen) => [kitchen.id, kitchen.name]));

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function startEdit(staffUser: StaffUser) {
    setEditingId(staffUser.id);
    setForm({
      name: staffUser.name,
      username: staffUser.username,
      password: "",
      role: staffUser.role,
      kitchenId: staffUser.kitchenId ?? "",
      employeeId: staffUser.employeeId ?? "",
    });
    setFormError(null);
    scrollFormIntoView(formCardRef.current);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const kitchenId = form.role === "KITCHEN" && form.kitchenId !== "" ? form.kitchenId : null;
    const employeeId = form.employeeId.trim() === "" ? null : form.employeeId.trim();

    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          input: {
            name: form.name,
            role: form.role,
            kitchenId,
            employeeId,
            ...(form.password.trim() !== "" ? { password: form.password } : {}),
          },
        });
      } else {
        await createMutation.mutateAsync({
          name: form.name,
          username: form.username,
          password: form.password,
          role: form.role,
          ...(kitchenId !== null ? { kitchenId } : {}),
          ...(employeeId !== null ? { employeeId } : {}),
        });
      }
      startCreate();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Failed to save staff user"));
    }
  }

  async function handleDelete(staffUser: StaffUser) {
    if (!window.confirm(`Delete staff user "${staffUser.name}"? They will no longer be able to log in.`)) {
      return;
    }
    try {
      await deactivateMutation.mutateAsync(staffUser.id);
    } catch (error) {
      window.alert(getApiErrorMessage(error, "Failed to delete staff user"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Staff" />

      {isKitchensError && (
        <p role="alert" className="text-body text-status-danger-text">
          Could not load kitchens — the kitchen dropdown may be incomplete.
        </p>
      )}

      <Card ref={formCardRef} title={editingId ? "Edit staff" : "Add staff"} className="max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="staff-name" className="text-meta font-medium text-ink-muted">
                Name
              </label>
              <Input
                id="staff-name"
                type="text"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="staff-username" className="text-meta font-medium text-ink-muted">
                Username
              </label>
              <Input
                id="staff-username"
                type="text"
                value={form.username}
                onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
                disabled={editingId !== null}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="staff-password" className="text-meta font-medium text-ink-muted">
              {editingId ? "New password" : "Password"}
            </label>
            <Input
              id="staff-password"
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder={editingId ? "Leave blank to keep current password" : undefined}
              required={!editingId}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="staff-role" className="text-meta font-medium text-ink-muted">
                Role
              </label>
              <Select
                id="staff-role"
                value={form.role}
                onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as StaffRole }))}
              >
                {STAFF_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </Select>
            </div>
            {form.role === "KITCHEN" && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="staff-kitchen" className="text-meta font-medium text-ink-muted">
                  Kitchen
                </label>
                <Select
                  id="staff-kitchen"
                  value={form.kitchenId}
                  onChange={(event) => setForm((prev) => ({ ...prev, kitchenId: event.target.value }))}
                  required
                >
                  <option value="" disabled>
                    Select a kitchen
                  </option>
                  {(kitchens ?? []).map((kitchen) => (
                    <option key={kitchen.id} value={kitchen.id}>
                      {kitchen.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="staff-employee-id" className="text-meta font-medium text-ink-muted">
              Employee ID
            </label>
            <Input
              id="staff-employee-id"
              type="text"
              value={form.employeeId}
              onChange={(event) => setForm((prev) => ({ ...prev, employeeId: event.target.value }))}
            />
          </div>

          {formError && (
            <p role="alert" className="text-body text-status-danger-text">
              {formError}
            </p>
          )}

          <FormActions>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? "Saving…" : editingId ? "Save changes" : "Add staff"}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={startCreate}>
                Cancel
              </Button>
            )}
          </FormActions>
        </form>
      </Card>

      {isLoading && <p className="text-body text-ink-muted">Loading staff…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load staff.</p>}

      {staffList && staffList.length === 0 && (
        <EmptyState title="No staff yet" description="Add a staff account to give someone access to the POS." />
      )}

      {staffList && staffList.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Username</TableHeaderCell>
              <TableHeaderCell>Role</TableHeaderCell>
              <TableHeaderCell>Kitchen</TableHeaderCell>
              <TableHeaderCell>Active</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {staffList.map((staffUser) => (
              <TableRow key={staffUser.id}>
                <TableCell className="font-medium text-ink">{staffUser.name}</TableCell>
                <TableCell>{staffUser.username}</TableCell>
                <TableCell>{ROLE_LABEL[staffUser.role]}</TableCell>
                <TableCell>{staffUser.kitchenId ? (kitchenNameById.get(staffUser.kitchenId) ?? "—") : "—"}</TableCell>
                <TableCell>
                  <StatusBadge status={staffUser.isActive ? "ACTIVE" : "INACTIVE"} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => startEdit(staffUser)}>
                      Edit
                    </Button>
                    {staffUser.isActive && (
                      <Button
                        variant="danger"
                        onClick={() => handleDelete(staffUser)}
                        disabled={deactivateMutation.isPending}
                      >
                        Delete
                      </Button>
                    )}
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
