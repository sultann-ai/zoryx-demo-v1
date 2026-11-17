import { useState } from "react";
import { getApiErrorMessage } from "../../api/errors";
import { Button, Card, Input, Switch, Textarea } from "../../components/ui";
import { ItemThumb } from "../../components/onlineStore/ItemThumb";
import { PhotoUploadControl } from "../../components/onlineStore/PhotoUploadControl";
import { SavedTick } from "../../components/onlineStore/SavedTick";
import { useSavedFlash } from "../../components/onlineStore/useSavedFlash";

// A menu item or a deal, as this screen sees it.
export interface OnlineEntry {
  kind: "item" | "deal";
  id: string;
  name: string;
  // "Chai · Only inside deals" — a line of context under the name.
  subtitle: string;
  imageId: string | null;
  nameUr: string | null;
  descriptionUr: string | null;
  isAvailableOnline: boolean;
  // The "Popular" star (menu items and deals).
  isFeatured: boolean;
}

export interface EntryPatch {
  imageId?: string | null;
  nameUr?: string | null;
  descriptionUr?: string | null;
  isAvailableOnline?: boolean;
  isFeatured?: boolean;
}

interface OnlineItemCardProps {
  entry: OnlineEntry;
  // Resolves when the change is saved AND the list has refreshed; throws the API error otherwise.
  save: (entry: OnlineEntry, patch: EntryPatch) => Promise<void>;
}

const blankToNull = (value: string) => (value.trim().length === 0 ? null : value.trim());

// Each card saves on its own: the switches and a new photo go straight to the server, the Urdu text waits
// for this card's "Save names". A "✓ Saved" shows beside whichever just went through.
export function OnlineItemCard({ entry, save }: OnlineItemCardProps) {
  // What the person has typed but not saved; null means "show what the server has".
  const [draft, setDraft] = useState<{ nameUr: string; descriptionUr: string } | null>(null);
  // Switches show the tap immediately and settle to the server's value once saved.
  const [pending, setPending] = useState<{ show?: boolean; popular?: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  const [isSavingText, setIsSavingText] = useState(false);
  const { isVisible: showSaved, flash } = useSavedFlash();

  const nameUr = draft?.nameUr ?? entry.nameUr ?? "";
  const descriptionUr = draft?.descriptionUr ?? entry.descriptionUr ?? "";
  const isDirty =
    draft !== null &&
    (draft.nameUr.trim() !== (entry.nameUr ?? "") || draft.descriptionUr.trim() !== (entry.descriptionUr ?? ""));

  function edit(change: Partial<{ nameUr: string; descriptionUr: string }>) {
    setDraft({ nameUr, descriptionUr, ...change });
  }

  async function run(patch: EntryPatch): Promise<boolean> {
    setError(null);
    try {
      await save(entry, patch);
      flash();
      return true;
    } catch (caught) {
      setError(getApiErrorMessage(caught, "Could not save. Please try again."));
      return false;
    }
  }

  async function handleSaveText() {
    setIsSavingText(true);
    const saved = await run({ nameUr: blankToNull(nameUr), descriptionUr: blankToNull(descriptionUr) });
    if (saved) {
      setDraft(null);
    }
    setIsSavingText(false);
  }

  async function handleSwitch(which: "show" | "popular", value: boolean) {
    setPending((previous) => ({ ...previous, [which]: value }));
    await run(which === "show" ? { isAvailableOnline: value } : { isFeatured: value });
    setPending((previous) => ({ ...previous, [which]: undefined }));
  }

  return (
    // h-full so every card in a grid row is as tall as the tallest, with the actions pinned to the bottom.
    <Card className="flex h-full flex-col gap-3">
      {/* A compact, fixed-size thumbnail beside the name: the same height with or without a photo. */}
      <div className="flex items-start gap-3">
        <ItemThumb mediaId={entry.imageId} name={entry.name} />
        <div className="min-w-0 flex-1">
          <p className="m-0 line-clamp-2 text-card-head font-semibold text-ink">{entry.name}</p>
          <p className="m-0 line-clamp-2 text-meta text-ink-muted">{entry.subtitle}</p>
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-meta font-medium text-ink-muted">Urdu name</span>
        <Input dir="rtl" lang="ur" value={nameUr} onChange={(event) => edit({ nameUr: event.target.value })} placeholder="اردو نام" maxLength={120} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-meta font-medium text-ink-muted">Urdu description</span>
        <Textarea
          dir="rtl"
          lang="ur"
          rows={2}
          value={descriptionUr}
          onChange={(event) => edit({ descriptionUr: event.target.value })}
          placeholder="مختصر تفصیل"
          maxLength={600}
          className="min-h-16"
        />
      </label>

      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Switch label="Show online" checked={pending.show ?? entry.isAvailableOnline} onChange={(value) => void handleSwitch("show", value)} />
        <Switch label="Popular" checked={pending.popular ?? entry.isFeatured} onChange={(value) => void handleSwitch("popular", value)} />
      </div>

      <PhotoUploadControl
        className="mt-auto"
        kind={entry.kind === "item" ? "MENU_ITEM" : "DEAL"}
        hasPhoto={entry.imageId !== null}
        // A failure here (the photo is stored but could not be attached) is thrown, so the upload control
        // shows it under the button as part of the upload.
        onUploaded={async (media) => {
          setError(null);
          await save(entry, { imageId: media.id });
          flash();
        }}
      />

      <div className="flex items-center justify-between gap-2">
        <Button variant="primary" onClick={() => void handleSaveText()} disabled={!isDirty || isSavingText}>
          {isSavingText ? "Saving…" : "Save names"}
        </Button>
        <SavedTick isVisible={showSaved} />
      </div>

      {error && (
        <p role="alert" className="text-meta text-status-danger-text">
          {error}
        </p>
      )}
    </Card>
  );
}
