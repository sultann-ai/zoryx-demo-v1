import { useState } from "react";
import type { FormEvent } from "react";
import { getApiErrorMessage } from "../../api/errors";
import { LineNote } from "../../components/LineNote";
import { Button, Input } from "../../components/ui";
import { LINE_NOTE_MAX_LENGTH, normalizeLineNote } from "../../lib/lineNotes";

interface EditableLineNoteProps {
  notes: string | null;
  // e.g. "Chicken Burger" — used in the accessible labels.
  itemName: string;
  canEdit: boolean;
  // Resolves once the server has saved it (and, for an order already in the kitchen,
  // pushed the change there); rejects with the API error to show.
  onSave: (notes: string | null) => Promise<unknown>;
}

// An order line's note on OrderDetailPage: shown under the item, with an inline
// Add/Edit/Remove editor while the order is still open. Saves straight to the server —
// unlike the cart's note input there's no surrounding form to commit with.
export function EditableLineNote({ notes, itemName, canEdit, onSave }: EditableLineNoteProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraft(notes ?? "");
    setError(null);
    setIsEditing(true);
  }

  async function save(next: string | null) {
    setIsSaving(true);
    setError(null);
    try {
      await onSave(next);
      setIsEditing(false);
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, "Failed to save note"));
    } finally {
      setIsSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeLineNote(draft);
    void save(normalized === "" ? null : normalized);
  }

  if (!isEditing) {
    return (
      <span className="block">
        {notes && <LineNote notes={notes} />}
        {canEdit && (
          <button
            type="button"
            onClick={startEditing}
            aria-label={notes ? `Edit note: ${itemName}` : `Add note: ${itemName}`}
            className="mt-1 inline-flex min-h-11 items-center rounded-card px-2 text-meta font-medium text-accent hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            {notes ? "Edit note" : "Add note"}
          </button>
        )}
      </span>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex w-full min-w-0 flex-col gap-2 font-normal sm:min-w-64">
      <Input
        autoFocus
        aria-label={`Note for ${itemName}`}
        value={draft}
        maxLength={LINE_NOTE_MAX_LENGTH}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setIsEditing(false);
          }
        }}
        placeholder="e.g. no onion, extra spicy"
        enterKeyHint="done"
      />
      <span className="self-end text-meta text-ink-muted" aria-hidden="true">
        {draft.length}/{LINE_NOTE_MAX_LENGTH}
      </span>
      {error && (
        <p role="alert" className="text-meta text-status-danger-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save note"}
        </Button>
        {notes && (
          <Button type="button" variant="danger" disabled={isSaving} onClick={() => void save(null)}>
            Remove
          </Button>
        )}
        <Button type="button" variant="secondary" disabled={isSaving} onClick={() => setIsEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
