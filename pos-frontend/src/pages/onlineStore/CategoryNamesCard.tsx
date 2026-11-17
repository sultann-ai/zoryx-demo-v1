import { useState } from "react";
import { getApiErrorMessage } from "../../api/errors";
import type { Category } from "../../api/categories";
import { Button, Card, Input } from "../../components/ui";
import { ImageThumb } from "../../components/onlineStore/ImageThumb";
import { PhotoUploadControl } from "../../components/onlineStore/PhotoUploadControl";
import { SavedTick } from "../../components/onlineStore/SavedTick";
import { useSavedFlash } from "../../components/onlineStore/useSavedFlash";
import { useUpdateCategoryOnlineContent } from "../../hooks/useOnlineStore";

// The category's own photo, shown on the website's category section. Without one the website uses the
// first item's photo, so this is optional.
function CategoryPhoto({ category }: { category: Category }) {
  const updateMutation = useUpdateCategoryOnlineContent();
  const { isVisible, flash } = useSavedFlash();

  return (
    // Thumbnail, name and hint on one line; the upload button sits inline at the end (below on a
    // phone, where there is no room beside the text).
    <div className="grid grid-cols-[5rem_1fr] items-center gap-x-3 gap-y-2 sm:grid-cols-[5rem_1fr_auto]">
      <ImageThumb mediaId={category.imageId} alt={`Photo for ${category.name}`} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body font-medium text-ink">{category.name}</span>
        {category.imageId === null && <span className="text-meta text-ink-muted">No photo: the first item’s photo is used.</span>}
      </div>
      <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
        <PhotoUploadControl
          className="w-full sm:w-40"
          kind="CATEGORY"
          hasPhoto={category.imageId !== null}
          onUploaded={async (media) => {
            await updateMutation.mutateAsync({ id: category.id, input: { imageId: media.id } });
            flash();
          }}
        />
        <SavedTick isVisible={isVisible} />
      </div>
    </div>
  );
}

function CategoryRow({ category }: { category: Category }) {
  const updateMutation = useUpdateCategoryOnlineContent();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isVisible, flash } = useSavedFlash();

  const value = draft ?? category.nameUr ?? "";
  const isDirty = draft !== null && draft.trim() !== (category.nameUr ?? "");

  async function handleSave() {
    setError(null);
    try {
      await updateMutation.mutateAsync({ id: category.id, input: { nameUr: value.trim().length === 0 ? null : value.trim() } });
      setDraft(null);
      flash();
    } catch (caught) {
      setError(getApiErrorMessage(caught, "Could not save this name."));
    }
  }

  return (
    // Each category is its own defined block: same border, background and padding every time.
    <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4">
      <CategoryPhoto category={category} />
      <div className="border-t border-border" />
      {/* Label and Save share a line (phone: label left, Save right, input underneath; sm and up:
          label, input and Save all in one row). */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[9rem_1fr_auto]">
        <label htmlFor={`urdu-name-${category.id}`} className="order-1 text-body font-medium text-ink">
          Urdu name
        </label>
        <Input
          id={`urdu-name-${category.id}`}
          dir="rtl"
          lang="ur"
          value={value}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="اردو نام"
          maxLength={120}
          className="order-3 col-span-2 sm:order-2 sm:col-span-1"
        />
        <div className="order-2 flex items-center gap-3 sm:order-3">
          <SavedTick isVisible={isVisible} />
          <Button variant="secondary" onClick={() => void handleSave()} disabled={!isDirty || updateMutation.isPending}>
            {updateMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
        {error && (
          <p role="alert" className="order-4 col-span-2 text-meta text-status-danger-text sm:col-span-3">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// The photo and Urdu name of every category, at the top because the website shows them as section headings.
export function CategoryNamesCard({ categories }: { categories: Category[] }) {
  if (categories.length === 0) {
    return null;
  }
  return (
    <Card title="Category photos and Urdu names">
      <div className="flex flex-col gap-4">
        {categories.map((category) => (
          <CategoryRow key={category.id} category={category} />
        ))}
      </div>
    </Card>
  );
}
