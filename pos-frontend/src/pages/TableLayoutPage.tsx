import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { getApiErrorMessage } from "../api/errors";
import type { FloorPlan, LayoutEntry, TableLayout } from "../api/tables";
import { Button, EmptyState, PageHeader, Switch, buttonClassName } from "../components/ui";
import { useMediaQuery } from "../hooks/useMediaQuery";
import type { TableDetailsChange } from "../hooks/useTables";
import { useFloorPlan, useSaveFloorLayout } from "../hooks/useTables";
import { AreaTabs } from "./tables/AreaTabs";
import { useRememberedArea } from "./tables/useRememberedArea";
import type { AreaTab } from "./tables/AreaTabs";
import { AreaTabsSkeleton, FloorCanvasSkeleton } from "./tables/FloorSkeleton";
import { LayoutCanvas } from "./tables/LayoutCanvas";
import type { LayoutDraft } from "./tables/LayoutCanvas";
import { LayoutInspector } from "./tables/LayoutInspector";
import { defaultSize, findFreeSpot, readingOrder, shapeKindOf } from "./tables/floorGeometry";
import { areaLabel } from "./tables/tableStates";

const AREA_STORAGE_KEY = "zoryx:table-layout-area";
const SNAP_STORAGE_KEY = "zoryx:table-layout-snap";

function draftsFrom(plan: FloorPlan): Record<string, LayoutDraft> {
  return Object.fromEntries(
    plan.tables.map((table) => [
      table.id,
      {
        id: table.id,
        name: table.name,
        capacityText: table.capacity === null ? "" : String(table.capacity),
        area: table.area ?? "",
        layout: table.layout,
        kind: table.layout ? shapeKindOf(table.layout) : "SQUARE",
      },
    ]),
  );
}

function sameLayout(a: TableLayout | null, b: TableLayout | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.shape === b.shape && a.rotation === b.rotation;
}

function capacityOf(text: string): number | null {
  return text.trim() === "" ? null : Number(text.trim());
}

function readSnap(): boolean {
  try {
    return window.localStorage.getItem(SNAP_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

// The floor layout editor (docs/TABLE_QR_SPEC.md §8.2), SUPER_ADMIN/POS_ADMIN. Loads once, then
// works on local drafts; nothing reaches the server until Save. Kept apart from the live map's
// refetches, so a table moving under someone's finger is never yanked back by a live update.
export function TableLayoutPage() {
  const { data, isPending, error } = useFloorPlan();

  const header = (actions?: ReactNode) => (
    <PageHeader
      title="Table layout"
      description="Drag tables into place, resize and turn them. Changes apply when you save."
      actions={actions}
    />
  );

  if (isPending) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        {header()}
        <AreaTabsSkeleton />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <FloorCanvasSkeleton square />
          <div className="hidden h-80 rounded-card border border-border bg-surface-raised lg:block" />
        </div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="flex flex-col gap-6">
        {header()}
        <p role="alert" className="text-body text-status-danger-text">
          {getApiErrorMessage(error, "Couldn't load the tables")}
        </p>
      </div>
    );
  }
  if (!data || data.tables.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header()}
        <EmptyState
          title="No tables yet"
          description="Add your tables in Dining areas first — then come back to place them on the floor plan."
          action={
            <Link to="/dining-areas" className={buttonClassName("primary")}>
              Add tables
            </Link>
          }
        />
      </div>
    );
  }
  return <LayoutEditor plan={data} header={header} />;
}

function LayoutEditor({ plan, header }: { plan: FloorPlan; header: (actions?: ReactNode) => ReactNode }) {
  const save = useSaveFloorLayout();
  const isWide = useMediaQuery("(min-width: 1024px)");
  // Drafts start from the plan as loaded; `baseline` is what the server has (moves on after a save).
  const [baseline, setBaseline] = useState(() => draftsFrom(plan));
  const [drafts, setDrafts] = useState(baseline);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(readSnap);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const areas = plan.areas;
  const [area, setArea] = useRememberedArea(AREA_STORAGE_KEY, areas);

  const changedIds = useMemo(
    () =>
      Object.values(drafts)
        .filter((draft) => {
          const base = baseline[draft.id];
          return !base || !sameLayout(draft.layout, base.layout) || draft.name !== base.name || draft.capacityText !== base.capacityText;
        })
        .map((draft) => draft.id),
    [drafts, baseline],
  );
  const isDirty = changedIds.length > 0;

  // A refresh or closed tab with unsaved moves asks first.
  useEffect(() => {
    if (!isDirty) {
      return;
    }
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const tabs: AreaTab[] = areas.map((name) => {
    const inArea = Object.values(drafts).filter((draft) => draft.area === name);
    const hasEdits = inArea.some((draft) => changedIds.includes(draft.id));
    return { area: name, count: inArea.length, flag: hasEdits ? { label: "unsaved changes", tone: "warning" } : null };
  });

  const areaDrafts = Object.values(drafts).filter((draft) => draft.area === area);
  const placed = areaDrafts
    .filter((draft) => draft.layout !== null)
    .sort(readingOrder);
  const unplaced = areaDrafts.filter((draft) => draft.layout === null).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const selected = selectedId ? (drafts[selectedId] ?? null) : null;

  function patch(id: string, change: Partial<LayoutDraft>) {
    setSavedAt(null);
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...change } }));
  }

  function place(draft: LayoutDraft) {
    const size = draft.kind === "RECT" ? defaultSize(capacityOf(draft.capacityText)) : (() => {
      const { w } = defaultSize(capacityOf(draft.capacityText));
      return { w, h: w };
    })();
    const taken = placed.flatMap((other) => (other.layout ? [other.layout] : []));
    const spot = findFreeSpot(size, taken);
    patch(draft.id, { layout: { ...spot, ...size, shape: draft.kind === "ROUND" ? "ROUND" : "RECT", rotation: 0 } });
    setSelectedId(draft.id);
  }

  function setSnap(next: boolean) {
    setSnapToGrid(next);
    try {
      window.localStorage.setItem(SNAP_STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Not remembered — still applies now.
    }
  }

  function handleSave() {
    setError(null);
    const changed = changedIds.map((id) => drafts[id]);
    const invalid = changed.find(
      (draft) => draft.name.trim() === "" || (draft.capacityText.trim() !== "" && !/^[1-9]\d{0,2}$/.test(draft.capacityText.trim())),
    );
    if (invalid) {
      setSelectedId(invalid.id);
      setArea(invalid.area);
      setError(`Check ${invalid.name.trim() || "the selected table"}: it needs a name, and seats must be a whole number.`);
      return;
    }
    const layout: LayoutEntry[] = changed
      .filter((draft) => !sameLayout(draft.layout, baseline[draft.id]?.layout ?? null))
      .map((draft) =>
        draft.layout
          ? { id: draft.id, ...draft.layout }
          : { id: draft.id, x: null, y: null, w: null, h: null },
      );
    const details: TableDetailsChange[] = changed
      .filter((draft) => draft.name !== baseline[draft.id]?.name || draft.capacityText !== baseline[draft.id]?.capacityText)
      .map((draft) => ({ id: draft.id, name: draft.name.trim(), capacity: capacityOf(draft.capacityText) }));
    const saved = drafts;
    save.mutate(
      { layout, details },
      {
        onSuccess: () => {
          const trimmed = Object.fromEntries(Object.entries(saved).map(([id, draft]) => [id, { ...draft, name: draft.name.trim() }]));
          setBaseline(trimmed);
          setDrafts(trimmed);
          setSavedAt(Date.now());
        },
        onError: (saveError) => setError(getApiErrorMessage(saveError, "Couldn't save the layout")),
      },
    );
  }

  function handleDiscard() {
    setDrafts(baseline);
    setError(null);
  }

  // Lives in the toolbar row, not the header: appearing in the header on the first drag would wrap
  // the buttons on a phone and shift the canvas under the finger.
  const saveStatus = (
    <span className="text-meta text-ink-muted tabular-nums" role="status" aria-live="polite">
      {save.isPending
        ? "Saving…"
        : isDirty
          ? `${changedIds.length} unsaved ${changedIds.length === 1 ? "change" : "changes"}`
          : savedAt
            ? "All changes saved"
            : ""}
    </span>
  );

  const actions = (
    <>
      <Link to="/tables" className={buttonClassName("secondary")}>
        Live map
      </Link>
      <Button variant="secondary" onClick={handleDiscard} disabled={!isDirty || save.isPending}>
        Discard
      </Button>
      <Button onClick={handleSave} disabled={!isDirty || save.isPending}>
        {save.isPending ? "Saving…" : "Save layout"}
      </Button>
    </>
  );

  const inspector = selected ? (
    <LayoutInspector
      key={selected.id}
      draft={selected}
      onChange={(change) => patch(selected.id, change)}
      onRemove={() => patch(selected.id, { layout: null })}
    />
  ) : (
    <p className="m-0 py-6 text-center text-body text-ink-muted">Tap a table to change its name, seats, shape or angle.</p>
  );

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {header(actions)}
      {error && (
        <p role="alert" className="text-body text-status-danger-text">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AreaTabs
          tabs={tabs}
          active={area}
          onSelect={(next) => {
            setArea(next);
            setSelectedId(null);
          }}
        />
        <div className="flex items-center gap-4">
          {saveStatus}
          <Switch checked={snapToGrid} onChange={setSnap} label="Snap to grid" />
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <LayoutCanvas
            drafts={placed}
            selectedId={selectedId}
            snapToGrid={snapToGrid}
            onSelect={setSelectedId}
            onChange={(id, layout) => patch(id, { layout })}
          />
          {placed.length === 0 && (
            <p className="m-0 text-center text-body text-ink-muted">
              Nothing placed in {areaLabel(area)} yet — tap a table below to put it on the floor.
            </p>
          )}

          {unplaced.length > 0 && (
            <section className="flex flex-col gap-2" aria-label="Tables not on the floor plan">
              <h2 className="m-0 text-card-head font-semibold text-ink">Not on the floor plan</h2>
              <ul className="m-0 p-0 flex list-none flex-wrap gap-2">
                {unplaced.map((draft) => (
                  <li key={draft.id}>
                    <Button variant="secondary" onClick={() => place(draft)}>
                      Place {draft.name}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside
          aria-label="Selected table"
          className={isWide ? "sticky top-0 rounded-card border border-border bg-surface-raised p-4" : "rounded-card border border-border bg-surface-raised p-4"}
        >
          {inspector}
        </aside>
      </div>
    </div>
  );
}
