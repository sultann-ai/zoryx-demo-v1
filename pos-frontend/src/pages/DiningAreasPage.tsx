import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { tableErrorMessage } from "../lib/tableErrors";
import type { DiningArea, DiningAreaType } from "../api/diningAreas";
import { DINING_AREA_SECTION_MAX_LENGTH } from "../api/diningAreas";
import {
  useCreateDiningArea,
  useDeleteDiningArea,
  useDiningAreas,
  useUpdateDiningArea,
} from "../hooks/useDiningAreas";
import { scrollFormIntoView } from "../lib/scrollFormIntoView";
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

const TYPE_LABEL: Record<DiningAreaType, string> = {
  TABLE: "Table",
  FAMILY_HALL: "Family hall",
  GENTS_HALL: "Gents hall",
};

const TYPE_OPTIONS = (Object.keys(TYPE_LABEL) as DiningAreaType[]).map((value) => ({ value, label: TYPE_LABEL[value] }));

interface FormState {
  name: string;
  type: DiningAreaType;
  // The room/section ("Family Hall") the New Order screens filter tables by; "" for none.
  area: string;
  // Kept as the raw input string so the field can be empty; parsed on submit.
  capacity: string;
}

const EMPTY_FORM: FormState = { name: "", type: "TABLE", area: "", capacity: "" };

export function DiningAreasPage() {
  const { data: diningAreas, isLoading, isError } = useDiningAreas();
  const createMutation = useCreateDiningArea();
  const updateMutation = useUpdateDiningArea();
  const deleteMutation = useDeleteDiningArea();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  const isSaving = createMutation.isPending || updateMutation.isPending;
  // Offered as suggestions so an existing area is picked rather than retyped with a
  // different spelling (which would show up as a separate filter chip on New Order).
  const areasInUse = [...new Set((diningAreas ?? []).flatMap((diningArea) => (diningArea.area ? [diningArea.area] : [])))].sort(
    (a, b) => a.localeCompare(b),
  );

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function startEdit(diningArea: DiningArea) {
    setEditingId(diningArea.id);
    setForm({
      name: diningArea.name,
      type: diningArea.type,
      area: diningArea.area ?? "",
      capacity: diningArea.capacity === null ? "" : String(diningArea.capacity),
    });
    setFormError(null);
    scrollFormIntoView(formCardRef.current);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const trimmedCapacity = form.capacity.trim();
    const capacity = trimmedCapacity === "" ? null : Number(trimmedCapacity);
    const area = form.area.trim();

    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          input: { name: form.name, type: form.type, area: area === "" ? null : area, capacity },
        });
      } else {
        await createMutation.mutateAsync({
          name: form.name,
          type: form.type,
          ...(area !== "" ? { area } : {}),
          ...(capacity !== null ? { capacity } : {}),
        });
      }
      startCreate();
    } catch (error) {
      setFormError(tableErrorMessage(error, "Failed to save dining area"));
    }
  }

  async function handleDelete(diningArea: DiningArea) {
    if (!window.confirm(`Delete dining area "${diningArea.name}"?`)) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(diningArea.id);
      if (editingId === diningArea.id) {
        startCreate();
      }
    } catch (error) {
      window.alert(tableErrorMessage(error, "Failed to delete dining area"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dining areas" />

      <Card ref={formCardRef} title={editingId ? "Edit dining area" : "Add dining area"} className="max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dining-area-name" className="text-meta font-medium text-ink-muted">
              Name
            </label>
            <Input
              id="dining-area-name"
              type="text"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dining-area-section" className="text-meta font-medium text-ink-muted">
              Area / room
            </label>
            <Input
              id="dining-area-section"
              type="text"
              list="dining-area-section-options"
              maxLength={DINING_AREA_SECTION_MAX_LENGTH}
              value={form.area}
              onChange={(event) => setForm((prev) => ({ ...prev, area: event.target.value }))}
              placeholder="e.g. Family Hall"
              aria-describedby="dining-area-section-hint"
            />
            <datalist id="dining-area-section-options">
              {areasInUse.map((area) => (
                <option key={area} value={area} />
              ))}
            </datalist>
            <span id="dining-area-section-hint" className="text-meta text-ink-muted">
              Groups tables on New Order. Leave empty to list it under "Other".
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="dining-area-type" className="text-meta font-medium text-ink-muted">
                Type
              </label>
              <Select
                id="dining-area-type"
                value={form.type}
                onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as DiningAreaType }))}
              >
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="dining-area-capacity" className="text-meta font-medium text-ink-muted">
                Capacity
              </label>
              <Input
                id="dining-area-capacity"
                type="number"
                min={1}
                step={1}
                value={form.capacity}
                onChange={(event) => setForm((prev) => ({ ...prev, capacity: event.target.value }))}
              />
            </div>
          </div>
          {formError && (
            <p role="alert" className="text-body text-status-danger-text">
              {formError}
            </p>
          )}
          <FormActions>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? "Saving…" : editingId ? "Save changes" : "Add dining area"}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={startCreate}>
                Cancel
              </Button>
            )}
          </FormActions>
        </form>
      </Card>

      {isLoading && <p className="text-body text-ink-muted">Loading dining areas…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load dining areas.</p>}

      {diningAreas && diningAreas.length === 0 && (
        <EmptyState title="No dining areas yet" description="Add a table or hall to start seating orders." />
      )}

      {diningAreas && diningAreas.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Area</TableHeaderCell>
              <TableHeaderCell>Type</TableHeaderCell>
              <TableHeaderCell>Capacity</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {diningAreas.map((diningArea) => (
              <TableRow key={diningArea.id}>
                <TableCell className="font-medium text-ink">{diningArea.name}</TableCell>
                <TableCell>{diningArea.area ?? "—"}</TableCell>
                <TableCell>{TYPE_LABEL[diningArea.type]}</TableCell>
                <TableCell className="text-numeric">{diningArea.capacity ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => startEdit(diningArea)}>
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => handleDelete(diningArea)}
                      disabled={deleteMutation.isPending}
                    >
                      Delete
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
