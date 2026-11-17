import { useState } from "react";
import { getApiErrorMessage } from "../../api/errors";
import { Card, Switch } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useSiteSettings, useUpdateSiteSettings } from "../../hooks/useOnlineStore";

// How the till finishes a takeaway: on (the default), a POS takeaway is completed the moment it's
// marked paid. A POS setting, so only a Super Admin or POS Admin may change it (the server agrees).
export function TakeawayCompleteCard() {
  const { staff } = useAuth();
  const canEdit = staff?.role === "SUPER_ADMIN" || staff?.role === "POS_ADMIN";
  const { data: settings, isLoading } = useSiteSettings();
  const updateMutation = useUpdateSiteSettings();
  const [error, setError] = useState<string | null>(null);

  if (!settings && !isLoading) {
    return null;
  }

  async function handleChange(enabled: boolean) {
    setError(null);
    try {
      await updateMutation.mutateAsync({ autoCompleteTakeawayOnPayment: enabled });
    } catch (caught) {
      setError(getApiErrorMessage(caught, "Could not change this setting. Please try again."));
    }
  }

  const saved = settings?.autoCompleteTakeawayOnPayment ?? true;
  const checked = updateMutation.isPending ? !saved : saved;

  return (
    <Card className="flex flex-col gap-3">
      <Switch
        label="Complete takeaway orders when paid"
        description="A POS takeaway is finished as soon as its payment is confirmed. Turn this off if your counter takes payment before the food is ready."
        checked={checked}
        onChange={(value) => void handleChange(value)}
        disabled={!canEdit || isLoading || updateMutation.isPending}
      />
      {error && (
        <p role="alert" className="text-body text-status-danger-text">
          {error}
        </p>
      )}
    </Card>
  );
}
