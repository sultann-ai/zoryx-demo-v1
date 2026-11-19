import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getApiErrorMessage } from "../api/errors";
import type { FloorTable } from "../api/tables";
import { EmptyState, PageHeader, buttonClassName } from "../components/ui";
import { cn } from "../components/ui/cn";
import { useAuth } from "../context/AuthContext";
import { useIncomingOrdersContext } from "../context/IncomingOrdersContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useNow } from "../hooks/useNow";
import { useFloorPlan } from "../hooks/useTables";
import { AreaTabs } from "./tables/AreaTabs";
import { useRememberedArea } from "./tables/useRememberedArea";
import type { AreaTab } from "./tables/AreaTabs";
import { BottomSheet } from "./tables/BottomSheet";
import { FloorLegend } from "./tables/FloorLegend";
import { AreaTabsSkeleton, FloorCanvasSkeleton } from "./tables/FloorSkeleton";
import { FloorTile } from "./tables/FloorTile";
import { boxStyle, fitViewBox, readingOrder } from "./tables/floorGeometry";
import { TablePanel } from "./tables/TablePanel";
import { areaLabel } from "./tables/tableStates";

const AREA_STORAGE_KEY = "zoryx:tables-area";
// Below this many pixels per floor unit (a 4-seater ~56px wide) tiles get too small to tap or read, so
// the map stops shrinking and scrolls sideways in its frame instead — on a phone; a tablet fits it.
const MIN_PX_PER_UNIT = 0.56;

// The map is live through the shell's own socket (TableCallsProvider); for admins that's reception's
// connection, so its status is the one shown. TakerShell's top bar already shows the order taker's.
function AdminConnectionPill() {
  const { connectionStatus: status } = useIncomingOrdersContext();
  return (
    <span className="inline-flex h-11 items-center gap-1.5 text-meta font-medium text-ink-muted" role="status">
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", status === "live" ? "bg-status-success" : "bg-status-warning")}
        aria-hidden="true"
      />
      {status === "live" ? "Live" : "Reconnecting…"}
    </span>
  );
}

function floorSummary(tables: FloorTable[]): string {
  const seated = tables.filter((table) => table.session !== null).length;
  const calls = tables.filter((table) => table.attention !== null).length;
  const free = tables.filter((table) => table.state === "EMPTY").length;
  return [`${seated} seated`, `${free} free`, calls > 0 ? `${calls} waiting on a waiter` : ""].filter(Boolean).join(" · ");
}

// The live floor map (docs/TABLE_QR_SPEC.md §8.2): every table coloured by its state, open waiter
// calls badged, a tap opens the table's details — docked beside the map on wide screens, a bottom
// sheet below that. SUPER_ADMIN/POS_ADMIN reach it from the sidebar; ORDER_TAKER from TakerShell.
// "?table=<id>" (a waiter-call toast) opens that table, on its own area's tab.
export function TablesPage() {
  const { staff } = useAuth();
  const isAdmin = staff?.role === "SUPER_ADMIN" || staff?.role === "POS_ADMIN";
  const { data, isPending, error } = useFloorPlan();
  const now = useNow();
  const isWide = useMediaQuery("(min-width: 1024px)");
  const [searchParams] = useSearchParams();
  const linkedId = searchParams.get("table");
  const [selectedId, setSelectedId] = useState<string | null>(linkedId);

  const areas = useMemo(() => data?.areas ?? [], [data]);
  const [area, setArea] = useRememberedArea(AREA_STORAGE_KEY, areas);

  // Follow a new "?table=" (a toast tapped while already on this page) once the floor has loaded:
  // select it and show its area. Adjusting state during render, React's pattern for this.
  const [handledLink, setHandledLink] = useState<string | null>(null);
  const linkedTable = linkedId ? data?.tables.find((table) => table.id === linkedId) : undefined;
  if (linkedId !== handledLink && data) {
    setHandledLink(linkedId);
    if (linkedTable) {
      setSelectedId(linkedTable.id);
      if ((linkedTable.area ?? "") !== area) {
        setArea(linkedTable.area ?? "");
      }
    }
  }

  const tabs: AreaTab[] = useMemo(
    () =>
      areas.map((name) => {
        const inArea = (data?.tables ?? []).filter((table) => (table.area ?? "") === name);
        const hasCall = inArea.some((table) => table.attention !== null);
        return { area: name, count: inArea.length, flag: hasCall ? { label: "waiter call open", tone: "danger" } : null };
      }),
    [areas, data],
  );

  const areaTables = useMemo(() => (data?.tables ?? []).filter((table) => (table.area ?? "") === area), [data, area]);
  const placed = useMemo(() => areaTables.filter((table) => table.layout !== null).sort(readingOrder), [areaTables]);
  const unplaced = useMemo(() => areaTables.filter((table) => table.layout === null), [areaTables]);
  const view = useMemo(() => fitViewBox(placed.flatMap((table) => (table.layout ? [table.layout] : []))), [placed]);

  const selected = data?.tables.find((table) => table.id === selectedId) ?? null;
  const hasTables = (data?.tables.length ?? 0) > 0;

  function toggle(table: FloorTable) {
    setSelectedId((current) => (current === table.id ? null : table.id));
  }

  const header = (
    <PageHeader
      title="Tables"
      description="The floor, live. Tap a table to see who's there."
      actions={
        <>
          {/* TakerShell's top bar already shows the order taker's connection. */}
          {isAdmin && <AdminConnectionPill />}
          {isAdmin && hasTables && (
            <Link to="/tables/layout" className={buttonClassName("secondary")}>
              Arrange tables
            </Link>
          )}
        </>
      }
    />
  );

  if (isPending) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        {header}
        <AreaTabsSkeleton />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
          <FloorCanvasSkeleton />
          <div className="hidden h-64 rounded-card border border-border bg-surface-raised lg:block" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p role="alert" className="text-body text-status-danger-text">
          {getApiErrorMessage(error, "Couldn't load the floor")}
        </p>
      </div>
    );
  }

  if (!data || data.tables.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState
          title="No tables yet"
          description={isAdmin ? "Add your tables in Dining areas, then arrange them on the floor plan." : "Ask a manager to add the tables."}
          action={
            isAdmin && (
              <Link to="/dining-areas" className={buttonClassName("primary")}>
                Add tables
              </Link>
            )
          }
        />
      </div>
    );
  }

  const panel = selected ? (
    <TablePanel key={selected.id} table={selected} now={now} isAdmin={isAdmin} onClose={isWide ? undefined : () => setSelectedId(null)} />
  ) : null;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {header}

      <div className="flex flex-col gap-3">
        <AreaTabs tabs={tabs} active={area} onSelect={setArea} />
        <p className="m-0 text-meta text-ink-muted tabular-nums">
          {areaLabel(area)} · {floorSummary(areaTables)}
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {placed.length > 0 ? (
            // The map keeps a readable size on a phone and scrolls sideways inside its own frame;
            // the page itself never scrolls horizontally.
            <div className="overflow-x-auto overscroll-x-contain rounded-card border border-border bg-surface-raised">
              <div
                className="relative"
                style={{ aspectRatio: `${view.w} / ${view.h}`, minWidth: `${Math.round(view.w * MIN_PX_PER_UNIT)}px` }}
                role="group"
                aria-label={`${areaLabel(area)} floor plan`}
              >
                {placed.map((table) =>
                  table.layout ? (
                    <FloorTile
                      key={table.id}
                      table={table}
                      now={now}
                      variant="map"
                      isSelected={table.id === selectedId}
                      onSelect={() => toggle(table)}
                      style={boxStyle(table.layout, view)}
                    />
                  ) : null,
                )}
              </div>
            </div>
          ) : null}
          {placed.length > 0 && view.w * MIN_PX_PER_UNIT > 340 && (
            <p className="-mt-2 m-0 text-meta text-ink-muted sm:hidden">Swipe the floor plan sideways to see every table.</p>
          )}
          {placed.length === 0 && (
            <EmptyState
              title={`Nothing on the floor plan in ${areaLabel(area)}`}
              description={
                isAdmin
                  ? "Arrange these tables on the floor plan to see them in place. Until then they're listed below."
                  : "These tables aren't on the floor plan yet. They're listed below."
              }
              action={
                isAdmin && (
                  <Link to="/tables/layout" className={buttonClassName("secondary")}>
                    Arrange tables
                  </Link>
                )
              }
            />
          )}

          {unplaced.length > 0 && (
            <section className="flex flex-col gap-2" aria-label="Tables not on the floor plan">
              <h2 className="m-0 text-card-head font-semibold text-ink">Not on the floor plan</h2>
              <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3 xl:grid-cols-4">
                {unplaced.map((table) => (
                  <FloorTile
                    key={table.id}
                    table={table}
                    now={now}
                    variant="card"
                    isSelected={table.id === selectedId}
                    onSelect={() => toggle(table)}
                  />
                ))}
              </div>
            </section>
          )}

          <FloorLegend defaultOpen={isWide} />
        </div>

        {isWide && (
          <aside
            aria-label="Table details"
            className="sticky top-0 max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-card border border-border bg-surface-raised p-4"
          >
            {panel ?? (
              <p className="m-0 py-8 text-center text-body text-ink-muted">
                Tap a table to see its guests, orders and calls.
              </p>
            )}
          </aside>
        )}
      </div>

      {!isWide && (
        <BottomSheet isOpen={selected !== null} onClose={() => setSelectedId(null)} label={selected ? `${selected.name} details` : "Table details"}>
          {panel}
        </BottomSheet>
      )}
    </div>
  );
}
