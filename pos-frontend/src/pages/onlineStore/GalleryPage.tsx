import { useRef, useState } from "react";
import { getApiErrorMessage } from "../../api/errors";
import { mediaApi } from "../../api/media";
import type { GalleryImage } from "../../api/onlineStore";
import { Button, Card, ConfirmDialog, EmptyState, Input } from "../../components/ui";
import { cn } from "../../components/ui/cn";
import { ImageThumb } from "../../components/onlineStore/ImageThumb";
import { ListRowActions } from "../../components/onlineStore/ListRowActions";
import { OnlineStoreHeader } from "../../components/onlineStore/OnlineStoreHeader";
import { SavedTick } from "../../components/onlineStore/SavedTick";
import { useSavedFlash } from "../../components/onlineStore/useSavedFlash";
import { UploadProgress } from "../../components/onlineStore/UploadProgress";
import { describeUploadError } from "../../components/onlineStore/usePhotoUpload";
import type { UploadState } from "../../components/onlineStore/usePhotoUpload";
import {
  useCreateGalleryImage,
  useDeleteGalleryImage,
  useGalleryImages,
  useReorderGalleryImages,
  useUpdateGalleryImage,
} from "../../hooks/useOnlineStore";
import { downscaleImage } from "../../lib/imageResize";
import { moveRow } from "../../lib/reorder";

const MAX_SHOWN = 24;

const blankToNull = (value: string) => (value.trim().length === 0 ? null : value.trim());

function GalleryCard({
  image,
  isFirst,
  isLast,
  busy,
  onMove,
  onToggle,
  onDelete,
}: {
  image: GalleryImage;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onMove: (direction: "up" | "down") => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const updateMutation = useUpdateGalleryImage();
  const [draft, setDraft] = useState<{ en: string; ur: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isVisible, flash } = useSavedFlash();

  const en = draft?.en ?? image.captionEn ?? "";
  const ur = draft?.ur ?? image.captionUr ?? "";
  const isDirty = draft !== null && (draft.en.trim() !== (image.captionEn ?? "") || draft.ur.trim() !== (image.captionUr ?? ""));

  async function handleSave() {
    setError(null);
    try {
      await updateMutation.mutateAsync({ id: image.id, input: { captionEn: blankToNull(en), captionUr: blankToNull(ur) } });
      setDraft(null);
      flash();
    } catch (caught) {
      setError(getApiErrorMessage(caught, "Could not save the captions."));
    }
  }

  return (
    <Card className={cn("flex flex-col gap-3", !image.isActive && "bg-surface")}>
      <div className="relative">
        <ImageThumb mediaId={image.mediaId} alt={image.captionEn ?? "Gallery photo"} className={cn(!image.isActive && "opacity-50")} />
        {!image.isActive && (
          <span className="absolute left-2 top-2 rounded-card border border-border bg-surface-raised px-2 py-0.5 text-meta font-medium text-ink-muted">Hidden</span>
        )}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-meta font-medium text-ink-muted">Caption (English)</span>
        <Input value={en} onChange={(event) => setDraft({ en: event.target.value, ur })} maxLength={200} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-meta font-medium text-ink-muted">Caption (Urdu)</span>
        <Input dir="rtl" lang="ur" value={ur} onChange={(event) => setDraft({ en, ur: event.target.value })} maxLength={200} />
      </label>
      <div className="flex items-center justify-between gap-2">
        <Button variant="primary" onClick={() => void handleSave()} disabled={!isDirty || updateMutation.isPending}>
          {updateMutation.isPending ? "Saving…" : "Save captions"}
        </Button>
        <SavedTick isVisible={isVisible} />
      </div>
      {error && (
        <p role="alert" className="text-meta text-status-danger-text">
          {error}
        </p>
      )}
      <ListRowActions
        isFirst={isFirst}
        isLast={isLast}
        onMoveUp={() => onMove("up")}
        onMoveDown={() => onMove("down")}
        isActive={image.isActive}
        onToggleActive={onToggle}
        onDelete={onDelete}
        disabled={busy}
      />
    </Card>
  );
}

interface QueuedUpload {
  key: string;
  name: string;
  state: UploadState;
}

export function GalleryPage() {
  const { data: images, isLoading, isError } = useGalleryImages();
  const createMutation = useCreateGalleryImage();
  const updateMutation = useUpdateGalleryImage();
  const deleteMutation = useDeleteGalleryImage();
  const reorderMutation = useReorderGalleryImages();

  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueuedUpload[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<GalleryImage | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const shownCount = (images ?? []).filter((image) => image.isActive).length;
  const isUploading = queue.some((entry) => entry.state.phase !== "error");

  function patchQueue(key: string, state: UploadState) {
    setQueue((previous) => previous.map((entry) => (entry.key === key ? { ...entry, state } : entry)));
  }

  // One file at a time: shrink it, send it (with a progress bar), then add it to the gallery. A failure
  // on one photo is shown on its own line and never stops the others.
  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    if (files.length === 0) {
      return;
    }
    const entries = files.map((file, index) => ({
      key: `${Date.now()}-${index}`,
      name: file.name,
      state: { phase: "preparing", percent: 0, error: null } as UploadState,
    }));
    setQueue((previous) => [...previous, ...entries]);

    let nextSort = Math.max(-1, ...(images ?? []).map((image) => image.sortOrder)) + 1;
    for (const [index, file] of files.entries()) {
      const { key } = entries[index]!;
      try {
        const prepared = await downscaleImage(file);
        patchQueue(key, { phase: "uploading", percent: 0, error: null });
        const media = await mediaApi.upload(prepared, "GALLERY", (percent) => patchQueue(key, { phase: "uploading", percent, error: null }));
        patchQueue(key, { phase: "saving", percent: 100, error: null });
        await createMutation.mutateAsync({ mediaId: media.id, sortOrder: nextSort });
        nextSort += 1;
        setQueue((previous) => previous.filter((entry) => entry.key !== key));
      } catch (error) {
        patchQueue(key, { phase: "error", percent: 0, error: describeUploadError(error) });
      }
    }
  }

  async function handleToggle(image: GalleryImage) {
    setListError(null);
    try {
      await updateMutation.mutateAsync({ id: image.id, input: { isActive: !image.isActive } });
    } catch (error) {
      setListError(getApiErrorMessage(error, "Could not change this photo."));
    }
  }

  async function handleMove(image: GalleryImage, direction: "up" | "down") {
    setListError(null);
    try {
      await reorderMutation.mutateAsync(moveRow(images ?? [], image.id, direction));
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
      setToDelete(null);
    } catch (error) {
      setDeleteError(getApiErrorMessage(error, "Could not delete this photo."));
    }
  }

  const busy = updateMutation.isPending || reorderMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      <OnlineStoreHeader
        title="Gallery"
        description={`Photos of the shop and food for the website. ${shownCount} of ${MAX_SHOWN} shown.`}
        actions={
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => void handleFiles(event.target.files)}
            />
            <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={isUploading}>
              Add photos
            </Button>
          </>
        }
      />

      {queue.length > 0 && (
        <Card title="Uploading">
          <ul className="flex list-none flex-col gap-3">
            {queue.map((entry) => (
              <li key={entry.key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-body text-ink">{entry.name}</span>
                  {entry.state.phase === "error" && (
                    <Button variant="secondary" onClick={() => setQueue((previous) => previous.filter((item) => item.key !== entry.key))}>
                      Dismiss
                    </Button>
                  )}
                </div>
                <UploadProgress state={entry.state} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isLoading && <p className="text-body text-ink-muted">Loading the gallery…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load the gallery.</p>}
      {listError && (
        <p role="alert" className="text-body text-status-danger-text">
          {listError}
        </p>
      )}

      {images && images.length === 0 && queue.length === 0 && (
        <EmptyState title="No photos yet" description="Add photos of your shop and your food. You can choose several at once." />
      )}

      {images && images.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {images.map((image, index) => (
            <GalleryCard
              key={image.id}
              image={image}
              isFirst={index === 0}
              isLast={index === images.length - 1}
              busy={busy}
              onMove={(direction) => void handleMove(image, direction)}
              onToggle={() => void handleToggle(image)}
              onDelete={() => {
                setDeleteError(null);
                setToDelete(image);
              }}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => void handleDelete()}
        title="Delete this photo?"
        message="It is removed from the website and deleted. Use Hide instead if you may want it back."
        isConfirming={deleteMutation.isPending}
        error={deleteError}
      />
    </div>
  );
}
