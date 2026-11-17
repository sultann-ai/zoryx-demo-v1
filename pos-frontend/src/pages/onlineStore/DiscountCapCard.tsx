import { useState } from "react";
import type { FormEvent } from "react";
import { getApiErrorMessage } from "../../api/errors";
import { Button, Card, FormActions, Input } from "../../components/ui";
import { SavedTick } from "../../components/onlineStore/SavedTick";
import { useSavedFlash } from "../../components/onlineStore/useSavedFlash";
import { useAuth } from "../../context/AuthContext";
import { useSiteSettings, useUpdateSiteSettings } from "../../hooks/useOnlineStore";

// The largest discount a POS Admin may give, as a percent of an order's items. Only a Super Admin
// can change it (the server refuses anyone else); everyone else just reads it.
export function DiscountCapCard() {
  const { staff } = useAuth();
  const canEdit = staff?.role === "SUPER_ADMIN";
  const { data: settings } = useSiteSettings();
  const updateMutation = useUpdateSiteSettings();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isVisible: showSaved, flash } = useSavedFlash(4000);

  if (!settings) {
    return null;
  }
  const saved = String(Number(settings.maxDiscountPercentPosAdmin));
  const value = draft ?? saved;

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const trimmed = value.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed) || Number(trimmed) > 100) {
      setError("Enter a percentage from 0 to 100, like 20.");
      return;
    }
    try {
      await updateMutation.mutateAsync({ maxDiscountPercentPosAdmin: trimmed });
      setDraft(null);
      flash();
    } catch (caught) {
      setError(getApiErrorMessage(caught, "Could not save the discount limit."));
    }
  }

  return (
    <Card title="Discount limit" className="max-w-2xl">
      {canEdit ? (
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <label htmlFor="discount-cap" className="text-meta font-medium text-ink-muted">
            Largest discount a POS Admin can give (% of the order's items)
          </label>
          <div className="flex items-center gap-2">
            <Input id="discount-cap" inputMode="decimal" className="w-28" value={value} onChange={(event) => setDraft(event.target.value)} />
            <span className="text-body text-ink">%</span>
          </div>
          <p className="text-meta text-ink-muted">A Super Admin has no limit. Every discount needs a reason and is recorded with who gave it.</p>
          {error && (
            <p role="alert" className="text-body text-status-danger-text">
              {error}
            </p>
          )}
          <FormActions>
            <SavedTick isVisible={showSaved} />
            <Button type="submit" variant="primary" disabled={updateMutation.isPending || draft === null}>
              {updateMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </FormActions>
        </form>
      ) : (
        <p className="text-body text-ink">
          POS Admins can give up to <span className="font-semibold">{saved}%</span> off an order's items. Only a Super Admin can change this.
        </p>
      )}
    </Card>
  );
}
