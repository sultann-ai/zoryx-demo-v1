import { useMemo } from "react";
import { EmptyState, PageHeader } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useTableCallsContext } from "../context/TableCallsContext";
import { useNow } from "../hooks/useNow";
import { CallCard } from "./tables/CallCard";
import { PanelSkeleton } from "./tables/FloorSkeleton";

// The order taker's waiter calls (TakerShell's "Calls" tab): every open call, the ones sent to this
// waiter or to anyone first, oldest first within each. Live through TableCallsProvider — a new call
// chimes and buzzes the phone wherever the waiter is in the shell.
export function TakerCallsPage() {
  const { staff } = useAuth();
  const { calls, isLoading } = useTableCallsContext();
  const now = useNow(15_000);

  const ordered = useMemo(() => {
    const isMine = (routedToId: string | undefined) => routedToId === undefined || routedToId === staff?.id;
    return [...calls].sort((a, b) => Number(isMine(b.routedTo?.id)) - Number(isMine(a.routedTo?.id)));
  }, [calls, staff?.id]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Calls" description="Guests asking for a waiter from their table's QR." />
      {isLoading ? (
        <div aria-busy="true">
          <PanelSkeleton />
        </div>
      ) : ordered.length === 0 ? (
        <EmptyState title="No open calls" description="When a guest calls a waiter, it shows up here with a chime." />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {ordered.map((call) => (
            <CallCard key={call.id} call={call} now={now} showTable />
          ))}
        </ul>
      )}
    </div>
  );
}
