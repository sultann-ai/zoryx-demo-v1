import { useState } from "react";
import { getApiErrorMessage } from "../../api/errors";
import { Card, StatusBadge, Switch } from "../../components/ui";
import { useOnlineStoreState, useSiteSettings, useUpdateSiteSettings } from "../../hooks/useOnlineStore";

// What the website itself would say right now, in words staff can act on. "Business day not started" is
// the one reason that isn't fixed from this screen, so it says who can.
function LiveLine() {
  const { data, isLoading, isError } = useOnlineStoreState();

  if (isLoading) {
    return <span className="text-body text-ink-muted">Checking…</span>;
  }
  if (isError || !data) {
    return <span className="text-body text-ink-muted">Couldn't check whether customers can order right now.</span>;
  }
  if (data.orderingOpen) {
    return <StatusBadge status="READY" label="Customers can order now" />;
  }
  if (data.closedReason === "switched_off") {
    return <StatusBadge status="CANCELLED" label="Cannot order: switched off" />;
  }
  return (
    <span className="flex flex-col gap-0.5">
      <StatusBadge status="AWAITING_VERIFICATION" label="Cannot order: business day not started" />
      <span className="text-meta text-ink-muted">Reception starts the business day from the top bar.</span>
    </span>
  );
}

// The one switch that matters most on this page: it takes effect immediately, and the line under it is
// the website's own answer (the public /store endpoint), refreshed after every change.
export function OrderingSwitchCard() {
  const { data: settings, isLoading } = useSiteSettings();
  const updateMutation = useUpdateSiteSettings();
  const [error, setError] = useState<string | null>(null);

  async function handleChange(enabled: boolean) {
    setError(null);
    try {
      await updateMutation.mutateAsync({ onlineOrderingEnabled: enabled });
    } catch (caught) {
      setError(getApiErrorMessage(caught, "Could not change this setting. Please try again."));
    }
  }

  // While saving, show the tap straight away; otherwise show the saved value.
  const checked = updateMutation.isPending ? !(settings?.onlineOrderingEnabled ?? false) : (settings?.onlineOrderingEnabled ?? false);

  return (
    <Card className="flex flex-col gap-3">
      <Switch
        size="lg"
        label="Accept online orders"
        description="Turn this off to stop customers ordering, for example when the kitchen is overwhelmed."
        checked={checked}
        onChange={(value) => void handleChange(value)}
        disabled={isLoading || updateMutation.isPending}
      />
      <div aria-live="polite">
        <LiveLine />
      </div>
      {error && (
        <p role="alert" className="text-body text-status-danger-text">
          {error}
        </p>
      )}
    </Card>
  );
}
