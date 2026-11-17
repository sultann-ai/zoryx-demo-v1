import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { getApiErrorMessage } from "../../api/errors";
import type { SiteSettingsInput } from "../../api/onlineStore";
import { Button, Card, FormActions, Input, Switch } from "../../components/ui";
import { SavedTick } from "../../components/onlineStore/SavedTick";
import { useSavedFlash } from "../../components/onlineStore/useSavedFlash";
import { useSiteSettings, useUpdateSiteSettings } from "../../hooks/useOnlineStore";

function Field({ id, label, hint, children }: { id: string; label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-meta font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-meta text-ink-muted">{hint}</p>}
    </div>
  );
}

// Which ways of ordering the website offers. The two switches save at once (and the last one that is on
// cannot be switched off); the pickup minimum and note are saved with the button.
export function OrderTypesCard() {
  const { data: settings, isLoading } = useSiteSettings();
  const updateMutation = useUpdateSiteSettings();
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ min?: string; noteEn?: string; noteUr?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const { isVisible: showSaved, flash } = useSavedFlash(4000);

  const delivery = settings?.deliveryEnabled ?? true;
  const pickup = settings?.pickupEnabled ?? true;
  const savedMin = settings?.pickupMinOrderAmount ?? "0";
  const min = draft.min ?? (Number(savedMin) === 0 ? "" : String(Number(savedMin)));
  const noteEn = draft.noteEn ?? settings?.pickupNoteEn ?? "";
  const noteUr = draft.noteUr ?? settings?.pickupNoteUr ?? "";

  async function handleSwitch(input: SiteSettingsInput) {
    setSwitchError(null);
    try {
      await updateMutation.mutateAsync(input);
    } catch (caught) {
      setSwitchError(getApiErrorMessage(caught, "Could not change this setting. Please try again."));
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const trimmedMin = min.trim();
    if (trimmedMin !== "" && !/^\d+(\.\d{1,2})?$/.test(trimmedMin)) {
      setFormError("The pickup minimum must be an amount like 500 (or leave it empty for no minimum).");
      return;
    }
    const payload: SiteSettingsInput = {
      pickupMinOrderAmount: trimmedMin === "" ? "0" : trimmedMin,
      pickupNoteEn: noteEn.trim() === "" ? null : noteEn.trim(),
      pickupNoteUr: noteUr.trim() === "" ? null : noteUr.trim(),
    };
    try {
      await updateMutation.mutateAsync(payload);
      setDraft({});
      flash();
    } catch (caught) {
      setFormError(getApiErrorMessage(caught, "Could not save the pickup settings."));
    }
  }

  return (
    <Card title="Ways to order" className="flex flex-col gap-4">
      <p className="text-body text-ink-muted">
        Choose what customers can pick on the website. At least one must stay on. Pickup orders have no address and no delivery fee: the customer
        collects them at the shop.
      </p>
      <Switch
        size="lg"
        label="Delivery"
        description="Customers choose their area and enter an address."
        checked={delivery}
        onChange={(value) => void handleSwitch({ deliveryEnabled: value })}
        disabled={isLoading || updateMutation.isPending || (delivery && !pickup)}
      />
      <Switch
        size="lg"
        label="Pickup from the shop"
        description="Customers give a name and phone, and come to collect."
        checked={pickup}
        onChange={(value) => void handleSwitch({ pickupEnabled: value })}
        disabled={isLoading || updateMutation.isPending || (pickup && !delivery)}
      />
      {(delivery && !pickup) || (pickup && !delivery) ? (
        <p className="text-meta text-ink-muted">The one that is on can&apos;t be switched off: switch the other one on first.</p>
      ) : null}
      {switchError && (
        <p role="alert" className="text-body text-status-danger-text">
          {switchError}
        </p>
      )}

      {settings && (
        <form onSubmit={handleSave} className="flex flex-col gap-4 border-t border-line pt-4">
          <h3 className="text-card-head font-semibold text-ink">Pickup details</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              id="setting-pickupMin"
              label="Pickup minimum order (Rs)"
              hint="Customers cannot place a pickup order below this amount. Leave empty for no minimum."
            >
              <Input
                id="setting-pickupMin"
                inputMode="decimal"
                value={min}
                onChange={(event) => setDraft((previous) => ({ ...previous, min: event.target.value }))}
                placeholder="No minimum"
              />
            </Field>
            <div className="hidden md:block" />
            <Field id="setting-pickupNoteEn" label="Pickup note (English)" hint='Shown at checkout and on the order page, for example "Ready in about 20 minutes".'>
              <Input
                id="setting-pickupNoteEn"
                value={noteEn}
                onChange={(event) => setDraft((previous) => ({ ...previous, noteEn: event.target.value }))}
                maxLength={200}
              />
            </Field>
            <Field id="setting-pickupNoteUr" label="Pickup note (Urdu)">
              <Input
                id="setting-pickupNoteUr"
                dir="rtl"
                lang="ur"
                value={noteUr}
                onChange={(event) => setDraft((previous) => ({ ...previous, noteUr: event.target.value }))}
                maxLength={200}
              />
            </Field>
          </div>
          {formError && (
            <p role="alert" className="text-body text-status-danger-text">
              {formError}
            </p>
          )}
          <FormActions>
            <Button type="submit" disabled={updateMutation.isPending || Object.keys(draft).length === 0}>
              {updateMutation.isPending ? "Saving…" : "Save pickup details"}
            </Button>
            <SavedTick isVisible={showSaved} />
          </FormActions>
        </form>
      )}
    </Card>
  );
}
