import { useState } from "react";
import { getApiErrorMessage } from "../../api/errors";
import type { StaffTableCall } from "../../api/tables";
import { Button, StatusBadge } from "../../components/ui";
import { cn } from "../../components/ui/cn";
import { useAuth } from "../../context/AuthContext";
import { useAcknowledgeTableCall, useResolveTableCall } from "../../hooks/useTables";
import { CALL_STATUS_LABEL, CALL_TYPE_LABEL, areaLabel, formatElapsed } from "./tableStates";

// Who the call was sent to, from the reader's point of view.
function routedLabel(call: StaffTableCall, myId: string | undefined): string {
  if (call.routedTo === null) {
    return "For anyone";
  }
  return call.routedTo.id === myId ? "For you" : `For ${call.routedTo.name}`;
}

function answeredLabel(call: StaffTableCall, myId: string | undefined): string {
  if (!call.acknowledgedBy) {
    return "";
  }
  return call.acknowledgedBy.id === myId ? "You're on the way" : `${call.acknowledgedBy.name} is on the way`;
}

// One open waiter call with its two actions (spec §3.4): Acknowledge ("on my way", only while nobody
// has) and Done. The next step is the primary button. An escalated call — nobody answered within two
// minutes — gets the full danger border and says so in words, not only in colour.
export function CallCard({ call, now, showTable }: { call: StaffTableCall; now: number; showTable: boolean }) {
  const { staff } = useAuth();
  const me = staff ? { id: staff.id, name: staff.name } : null;
  const acknowledge = useAcknowledgeTableCall(me);
  const resolve = useResolveTableCall();
  const [error, setError] = useState<string | null>(null);
  const isRaised = call.status === "RAISED";
  const isEscalated = call.escalatedAt !== null && isRaised;
  const isBusy = acknowledge.isPending || resolve.isPending;

  function run(mutation: typeof acknowledge, fallback: string) {
    setError(null);
    mutation.mutate(call.id, { onError: (mutationError) => setError(getApiErrorMessage(mutationError, fallback)) });
  }

  const age = formatElapsed(call.createdAt, now);
  const who = [
    age === "just now" ? age : `${age} ago`,
    call.guestName,
    isRaised ? routedLabel(call, staff?.id) : answeredLabel(call, staff?.id),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-card border border-l-4 bg-surface-raised px-3 py-3",
        isEscalated ? "border-status-danger" : "border-border",
        isRaised ? "border-l-status-danger" : "border-l-status-active",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-0.5">
          {showTable && (
            <span className="text-body font-semibold text-ink">
              {call.table.name}
              <span className="font-normal text-ink-muted"> · {areaLabel(call.table.area)}</span>
            </span>
          )}
          <span className={cn("text-body text-ink", !showTable && "font-medium")}>
            {CALL_TYPE_LABEL[call.type]}
            {call.note && <span className="text-ink-muted"> — {call.note}</span>}
          </span>
          <span className="text-meta text-ink-muted tabular-nums">{who}</span>
          {isEscalated && <span className="text-meta font-semibold text-status-danger-text">Waiting too long</span>}
        </span>
        <span className="shrink-0">
          <StatusBadge status={call.status} tone={isRaised ? "danger" : "active"} label={CALL_STATUS_LABEL[call.status]} />
        </span>
      </div>
      {error && (
        <p role="alert" className="m-0 text-meta text-status-danger-text">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        {isRaised && (
          <Button className="flex-1" onClick={() => run(acknowledge, "Couldn't acknowledge this call")} disabled={isBusy}>
            Acknowledge
          </Button>
        )}
        <Button
          variant={isRaised ? "secondary" : "primary"}
          className="flex-1"
          onClick={() => run(resolve, "Couldn't mark this call done")}
          disabled={isBusy}
        >
          Done
        </Button>
      </div>
    </li>
  );
}
